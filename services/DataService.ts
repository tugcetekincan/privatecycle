import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

// Utility function to format date without timezone issues
const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Ovulation typically occurs ~14 days before the next period (luteal phase length).
export const LUTEAL_PHASE_DAYS = 14;
// The fertile window spans the 5 days leading up to and including ovulation.
export const FERTILE_WINDOW_DAYS = 5;

export interface DailyData {
  date: string;
  isPeriod: boolean;
  flowLevel: string;
  symptoms: string[];
  mood: string;
  // Ovulation / fertility tracking
  ovulationTest: string; // '' | 'positive' | 'negative' (LH/OPK result)
  cervicalMucus: string; // '' | 'dry' | 'sticky' | 'creamy' | 'watery' | 'eggwhite'
  bbt: number | null; // basal body temperature (°C)
}

export interface PeriodData {
  periods: string[];
  symptoms: { [date: string]: string[] };
  moods: { [date: string]: string };
}

/* ---------------------------------------------------------------------------
 * Schema migrations
 *
 * The database schema is versioned via SQLite's `PRAGMA user_version`. To evolve
 * the schema, append a new entry to MIGRATIONS with the next version number and
 * an `up` function. On startup, every migration whose version is greater than the
 * database's current `user_version` runs in order, each inside a transaction, and
 * the version is advanced as each one succeeds.
 *
 * Rules:
 *  - Never edit or reorder a migration that has shipped; only append new ones.
 *  - Keep migrations idempotent where practical (CREATE ... IF NOT EXISTS,
 *    addColumnIfMissing) so a partially-applied migration can safely re-run.
 * ------------------------------------------------------------------------- */

interface Migration {
  version: number;
  name: string;
  up: (db: SQLite.SQLiteDatabase) => Promise<void>;
}

const columnExists = async (
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string
): Promise<boolean> => {
  const cols = (await db.getAllAsync(`PRAGMA table_info(${table})`)) as { name: string }[];
  return cols.some(col => col.name === column);
};

const addColumnIfMissing = async (
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string
): Promise<void> => {
  if (!(await columnExists(db, table, column))) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS daily_data (
          date TEXT PRIMARY KEY,
          is_period INTEGER NOT NULL DEFAULT 0,
          flow_level TEXT NOT NULL DEFAULT '',
          symptoms TEXT NOT NULL DEFAULT '[]',
          mood TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_daily_data_date ON daily_data(date);
        CREATE INDEX IF NOT EXISTS idx_daily_data_period ON daily_data(is_period);
      `);
    },
  },
  {
    version: 2,
    name: 'add_ovulation_fields',
    up: async (db) => {
      await addColumnIfMissing(db, 'daily_data', 'ovulation_test', "TEXT NOT NULL DEFAULT ''");
      await addColumnIfMissing(db, 'daily_data', 'cervical_mucus', "TEXT NOT NULL DEFAULT ''");
      await addColumnIfMissing(db, 'daily_data', 'bbt', 'REAL');
    },
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

// All database access is funneled through this single promise chain so that no
// two statements ever run concurrently on the shared connection. On web the
// wa-sqlite worker is not reentrant — overlapping getAllAsync/runAsync calls
// (e.g. the calendar page reloading while a save is in flight) throw
// "Error finalizing statement". Serializing every operation prevents that.
let opChain: Promise<unknown> = Promise.resolve();
const serialize = <T>(op: () => Promise<T>): Promise<T> => {
  const run = opChain.then(op, op);
  // Keep the chain alive regardless of individual success/failure.
  opChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
};

// The query methods whose calls must be serialized. withTransactionAsync is
// intentionally excluded: it is only used by migrations, which run on the raw
// connection during init (before any serialized access), and serializing it
// would deadlock against the statements run inside its callback.
const SERIALIZED_METHODS = new Set(['getAllAsync', 'getFirstAsync', 'runAsync', 'execAsync']);

// Wrap a connection so each query method runs through the global op chain.
const createSerializedDb = (db: SQLite.SQLiteDatabase): SQLite.SQLiteDatabase =>
  new Proxy(db, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        if (SERIALIZED_METHODS.has(prop as string)) {
          return (...args: unknown[]) => serialize(() => (value as Function).apply(target, args));
        }
        return (value as Function).bind(target);
      }
      return value;
    },
  });

class SQLiteDataService {
  private db: SQLite.SQLiteDatabase | null = null;
  private serializedDb: SQLite.SQLiteDatabase | null = null;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    // Start initialization immediately when service is created
    this.initializeDatabase().catch(error => {
      console.error('Failed to initialize database during construction:', error);
    });
  }

  private async initializeDatabase(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.performInitialization();
    return this.initializationPromise;
  }

  private async performInitialization(): Promise<void> {
    try {
      if (this.db) {
        return; // Already initialized
      }

      console.log('Initializing SQLite database...');
      this.db = await SQLite.openDatabaseAsync('cycle_tracker.db');
      
      if (!this.db) {
        throw new Error('Failed to open database');
      }

      // WAL improves concurrency on native, but the web (wa-sqlite / OPFS) VFS
      // does not support it — requesting WAL there silently drops writes made
      // inside transactions (e.g. CREATE TABLE), which corrupts the schema.
      if (Platform.OS !== 'web') {
        await this.db.execAsync('PRAGMA journal_mode = WAL;');
      }
      await this.db.execAsync('PRAGMA foreign_keys = ON;');

      // Bring the schema up to date via versioned migrations
      await this.runMigrations(this.db);

      console.log('SQLite database initialized successfully');
    } catch (error) {
      console.error('Error initializing database:', error);
      this.db = null;
      this.initializationPromise = null;
      throw error;
    }
  }

  private async runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
    const versionRow = (await db.getFirstAsync('PRAGMA user_version')) as
      | { user_version: number }
      | null;
    let currentVersion = versionRow?.user_version ?? 0;

    // Self-heal a corrupt schema: if user_version claims migrations have run but
    // the core table is missing, the schema was never actually persisted (this
    // happened on web under the unsupported WAL mode). Reset to 0 so migrations
    // re-run from scratch and recreate the schema.
    if (currentVersion > 0) {
      const coreTable = (await db.getAllAsync(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='daily_data'"
      )) as { name: string }[];
      if (coreTable.length === 0) {
        console.warn(
          `Schema version is ${currentVersion} but daily_data table is missing; resetting to re-run migrations.`
        );
        await db.execAsync('PRAGMA user_version = 0');
        currentVersion = 0;
      }
    }

    if (currentVersion >= LATEST_SCHEMA_VERSION) {
      return;
    }

    for (const migration of MIGRATIONS) {
      if (migration.version <= currentVersion) {
        continue;
      }

      console.log(`Running DB migration v${migration.version} (${migration.name})`);

      // Each migration is atomic: the schema change and the version bump commit
      // together, so a failed migration leaves user_version untouched and re-runs.
      await db.withTransactionAsync(async () => {
        await migration.up(db);
        // user_version cannot be parameterized; migration.version is a trusted integer.
        await db.execAsync(`PRAGMA user_version = ${migration.version}`);
      });

      currentVersion = migration.version;
    }

    console.log(`Database schema is at version ${currentVersion}`);
  }

  private async ensureInitialized(): Promise<SQLite.SQLiteDatabase> {
    await this.initializeDatabase();

    if (!this.db) {
      throw new Error('Database initialization failed');
    }

    // Hand out the serialized wrapper, never the raw connection, so all callers
    // share the single op chain.
    if (!this.serializedDb) {
      this.serializedDb = createSerializedDb(this.db);
    }
    return this.serializedDb;
  }

  // Exposes the single shared, migrated connection so other services don't open
  // their own. On web (wa-sqlite / OPFS) a second connection to the same file
  // yields an inconsistent view and breaks reads/writes — there must be exactly
  // one connection to cycle_tracker.db across the app.
  async getSharedDatabase(): Promise<SQLite.SQLiteDatabase> {
    return this.ensureInitialized();
  }

  async getPeriodData(): Promise<PeriodData> {
    try {
      const db = await this.ensureInitialized();
      
      const periodsResult = await db.getAllAsync(
        'SELECT date FROM daily_data WHERE is_period = 1 ORDER BY date'
      ) as { date: string }[];
      
      const symptomsResult = await db.getAllAsync(
        "SELECT date, symptoms FROM daily_data WHERE symptoms != '[]' ORDER BY date"
      ) as { date: string; symptoms: string }[];
      
      const moodsResult = await db.getAllAsync(
        "SELECT date, mood FROM daily_data WHERE mood != '' ORDER BY date"
      ) as { date: string; mood: string }[];

      const periods = periodsResult.map(row => row.date);
      
      const symptoms: { [date: string]: string[] } = {};
      symptomsResult.forEach(row => {
        try {
          const parsedSymptoms = JSON.parse(row.symptoms);
          if (parsedSymptoms.length > 0) {
            symptoms[row.date] = parsedSymptoms;
          }
        } catch (e) {
          console.error('Error parsing symptoms for date', row.date, e);
        }
      });

      const moods: { [date: string]: string } = {};
      moodsResult.forEach(row => {
        if (row.mood) {
          moods[row.date] = row.mood;
        }
      });

      return { periods, symptoms, moods };
    } catch (error) {
      console.error('Error loading period data:', error);
      return { periods: [], symptoms: {}, moods: {} };
    }
  }

  async saveTodayData(dateKey: string, data: DailyData): Promise<void> {
    try {
      console.log('Attempting to save data for date:', dateKey);
      const db = await this.ensureInitialized();
      
      if (!db) {
        throw new Error('Database connection is null');
      }

      const symptoms = JSON.stringify(data.symptoms || []);
      const flowLevel = data.flowLevel || '';
      const mood = data.mood || '';
      const ovulationTest = data.ovulationTest || '';
      const cervicalMucus = data.cervicalMucus || '';
      const bbt = typeof data.bbt === 'number' && !isNaN(data.bbt) ? data.bbt : null;

      console.log('Saving data:', {
        dateKey,
        isPeriod: data.isPeriod,
        flowLevel,
        symptoms,
        mood,
        ovulationTest,
        cervicalMucus,
        bbt
      });

      await db.runAsync(
        `INSERT OR REPLACE INTO daily_data
         (date, is_period, flow_level, symptoms, mood, ovulation_test, cervical_mucus, bbt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dateKey,
          data.isPeriod ? 1 : 0,
          flowLevel,
          symptoms,
          mood,
          ovulationTest,
          cervicalMucus,
          bbt
        ]
      );

      console.log('Data saved successfully for date:', dateKey);
    } catch (error) {
      console.error('Error saving data for date', dateKey, ':', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        data: data
      });
      throw error;
    }
  }

  async getTodayData(dateKey: string): Promise<DailyData | null> {
    try {
      const db = await this.ensureInitialized();
      
      const result = await db.getFirstAsync(
        'SELECT * FROM daily_data WHERE date = ?',
        [dateKey]
      ) as {
        date: string;
        is_period: number;
        flow_level: string;
        symptoms: string;
        mood: string;
        ovulation_test: string;
        cervical_mucus: string;
        bbt: number | null;
      } | null;

      if (!result) return null;

      return {
        date: result.date,
        isPeriod: result.is_period === 1,
        flowLevel: result.flow_level,
        symptoms: JSON.parse(result.symptoms),
        mood: result.mood,
        ovulationTest: result.ovulation_test || '',
        cervicalMucus: result.cervical_mucus || '',
        bbt: result.bbt ?? null
      };
    } catch (error) {
      console.error('Error loading today data:', error);
      return null;
    }
  }

  async getAllDailyData(): Promise<{ [date: string]: DailyData }> {
    try {
      const db = await this.ensureInitialized();
      
      const results = await db.getAllAsync(
        'SELECT * FROM daily_data ORDER BY date'
      ) as {
        date: string;
        is_period: number;
        flow_level: string;
        symptoms: string;
        mood: string;
        ovulation_test: string;
        cervical_mucus: string;
        bbt: number | null;
      }[];

      const dailyData: { [date: string]: DailyData } = {};

      results.forEach(row => {
        dailyData[row.date] = {
          date: row.date,
          isPeriod: row.is_period === 1,
          flowLevel: row.flow_level,
          symptoms: JSON.parse(row.symptoms),
          mood: row.mood,
          ovulationTest: row.ovulation_test || '',
          cervicalMucus: row.cervical_mucus || '',
          bbt: row.bbt ?? null
        };
      });

      return dailyData;
    } catch (error) {
      console.error('Error loading daily data:', error);
      return {};
    }
  }

  async getInsights() {
    try {
      const db = await this.ensureInitialized();
      
      // Get period start dates using SQL for better performance
      const periodStartsQuery = `
        WITH period_days AS (
          SELECT date, 
                 DATE(date, '-1 day') as prev_day
          FROM daily_data 
          WHERE is_period = 1
          ORDER BY date
        )
        SELECT pd.date
        FROM period_days pd
        LEFT JOIN daily_data prev ON prev.date = pd.prev_day AND prev.is_period = 1
        WHERE prev.date IS NULL
        ORDER BY pd.date
      `;
      
      const periodStartsResult = await db.getAllAsync(periodStartsQuery) as { date: string }[];
      const periodStarts = periodStartsResult.map(row => row.date);
      
      // Calculate average cycle length
      let averageCycle = 28;
      if (periodStarts.length >= 2) {
        const cycles: number[] = [];
        
        for (let i = 1; i < periodStarts.length; i++) {
          const prev = new Date(periodStarts[i - 1]);
          const curr = new Date(periodStarts[i]);
          const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
          cycles.push(diff);
        }
        
        if (cycles.length > 0) {
          averageCycle = Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length);
        }
      }

      // Calculate last period length using SQL
      let lastPeriodLength = 0;
      if (periodStarts.length > 0) {
        const lastPeriodStart = periodStarts[periodStarts.length - 1];
        
        // Get all period days starting from the last period start
        const periodDaysResult = await db.getAllAsync(
          `SELECT date FROM daily_data 
           WHERE date >= ? AND is_period = 1 
           ORDER BY date`,
          [lastPeriodStart]
        ) as { date: string }[];
        
        // Count consecutive days from the start
        if (periodDaysResult.length > 0) {
          let consecutiveDays = 1;
          let currentDate = new Date(periodDaysResult[0].date);
          
          for (let i = 1; i < periodDaysResult.length; i++) {
            const nextExpectedDate = new Date(currentDate);
            nextExpectedDate.setDate(nextExpectedDate.getDate() + 1);
            const nextActualDate = new Date(periodDaysResult[i].date);
            
            if (nextExpectedDate.getTime() === nextActualDate.getTime()) {
              consecutiveDays++;
              currentDate = nextActualDate;
            } else {
              break;
            }
          }
          
          lastPeriodLength = consecutiveDays;
        }
      }

      // Calculate next period prediction
      let nextPeriodIn = 0;
      if (periodStarts.length > 0) {
        const lastPeriodStart = new Date(periodStarts[periodStarts.length - 1]);
        const nextPredicted = new Date(lastPeriodStart);
        nextPredicted.setDate(nextPredicted.getDate() + averageCycle);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        nextPredicted.setHours(0, 0, 0, 0);
        
        const diffTime = nextPredicted.getTime() - today.getTime();
        nextPeriodIn = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      // Calculate next ovulation + fertile window prediction
      let nextOvulationIn = 0;
      let fertileWindowStart: string | null = null;
      let fertileWindowEnd: string | null = null;
      if (periodStarts.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Step forward cycle by cycle until we find an ovulation date that hasn't passed.
        const ovulation = new Date(periodStarts[periodStarts.length - 1]);
        ovulation.setHours(0, 0, 0, 0);
        ovulation.setDate(ovulation.getDate() + averageCycle - LUTEAL_PHASE_DAYS);
        while (ovulation.getTime() < today.getTime()) {
          ovulation.setDate(ovulation.getDate() + averageCycle);
        }

        nextOvulationIn = Math.ceil((ovulation.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        const windowStart = new Date(ovulation);
        windowStart.setDate(windowStart.getDate() - FERTILE_WINDOW_DAYS);
        fertileWindowStart = formatDateKey(windowStart);
        fertileWindowEnd = formatDateKey(ovulation);
      }

      // Get symptom counts using SQL
      const symptomCountsResult = await db.getAllAsync(`
        SELECT symptoms
        FROM daily_data
        WHERE symptoms != '[]'
      `) as { symptoms: string }[];

      const symptomCounts: { [key: string]: number } = {};
      symptomCountsResult.forEach(row => {
        try {
          const symptoms = JSON.parse(row.symptoms);
          symptoms.forEach((symptom: string) => {
            symptomCounts[symptom] = (symptomCounts[symptom] || 0) + 1;
          });
        } catch (e) {
          console.error('Error parsing symptoms:', e);
        }
      });

      const commonSymptoms = Object.entries(symptomCounts)
        .map(([symptom, count]) => ({ symptom, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Get mood counts using SQL
      const moodCountsResult = await db.getAllAsync(`
        SELECT mood, COUNT(*) as count
        FROM daily_data
        WHERE mood != ''
        GROUP BY mood
        ORDER BY count DESC
        LIMIT 5
      `) as { mood: string; count: number }[];

      const moodTrends = moodCountsResult.map(row => ({
        mood: row.mood,
        count: row.count
      }));

      return {
        averageCycle,
        lastPeriodLength,
        nextPeriodIn,
        nextOvulationIn,
        fertileWindowStart,
        fertileWindowEnd,
        totalPeriods: periodStarts.length,
        commonSymptoms,
        moodTrends,
      };
    } catch (error) {
      console.error('Error calculating insights:', error);
      return {
        averageCycle: 28,
        lastPeriodLength: 0,
        nextPeriodIn: 0,
        nextOvulationIn: 0,
        fertileWindowStart: null as string | null,
        fertileWindowEnd: null as string | null,
        totalPeriods: 0,
        commonSymptoms: [],
        moodTrends: [],
      };
    }
  }

  async clearAllData(): Promise<void> {
    try {
      const db = await this.ensureInitialized();
      await db.runAsync('DELETE FROM daily_data');
    } catch (error) {
      console.error('Error clearing data:', error);
      throw error;
    }
  }

  async migrateFromAsyncStorage(): Promise<void> {
    try {
      // This method can be called to migrate existing AsyncStorage data to SQLite
      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      
      const periodDataStr = await AsyncStorage.default.getItem('period_data');
      const dailyDataStr = await AsyncStorage.default.getItem('daily_data');
      
      if (dailyDataStr) {
        const dailyData = JSON.parse(dailyDataStr);
        const db = await this.ensureInitialized();
        
        for (const [date, data] of Object.entries(dailyData) as [string, any][]) {
          await db.runAsync(
            `INSERT OR REPLACE INTO daily_data
             (date, is_period, flow_level, symptoms, mood, ovulation_test, cervical_mucus, bbt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              date,
              data.isPeriod ? 1 : 0,
              data.flowLevel || '',
              JSON.stringify(data.symptoms || []),
              data.mood || '',
              data.ovulationTest || '',
              data.cervicalMucus || '',
              typeof data.bbt === 'number' ? data.bbt : null
            ]
          );
        }
        
        // Clean up old AsyncStorage data
        await AsyncStorage.default.removeItem('period_data');
        await AsyncStorage.default.removeItem('daily_data');
      }
    } catch (error) {
      console.error('Error migrating from AsyncStorage:', error);
    }
  }
}

const sqliteDataService = new SQLiteDataService();

// Shared, migrated SQLite connection. All services must use this rather than
// calling SQLite.openDatabaseAsync themselves — see getSharedDatabase above.
export const getSharedDatabase = (): Promise<SQLite.SQLiteDatabase> =>
  sqliteDataService.getSharedDatabase();

export class DataService {
  static formatDateKey = formatDateKey;

  static async getPeriodData(): Promise<PeriodData> {
    return sqliteDataService.getPeriodData();
  }

  static async saveTodayData(dateKey: string, data: DailyData): Promise<void> {
    return sqliteDataService.saveTodayData(dateKey, data);
  }

  static async getTodayData(dateKey: string): Promise<DailyData | null> {
    return sqliteDataService.getTodayData(dateKey);
  }

  static async getAllDailyData(): Promise<{ [date: string]: DailyData }> {
    return sqliteDataService.getAllDailyData();
  }

  static async getInsights() {
    return sqliteDataService.getInsights();
  }

  static async clearAllData(): Promise<void> {
    return sqliteDataService.clearAllData();
  }

  static async migrateFromAsyncStorage(): Promise<void> {
    return sqliteDataService.migrateFromAsyncStorage();
  }
}