import * as SQLite from 'expo-sqlite';
import { computeFertilityForecast, FertilityForecast, predictPeriodStarts } from './FertilityService';
import { addDays, daysBetween, formatDateKey, parseDateKey } from './dateKey';
import { buildMoodSeries, summarizeMoodByPhase, MoodDay, MOOD_SERIES_DAYS } from './MoodInsights';
import { MoodTag, parseMoodTags, serializeMoodTags } from './MoodTags';
import { summarizeSymptomPatterns, SymptomDay } from './SymptomInsights';

export interface DailyData {
  date: string;
  isPeriod: boolean;
  flowLevel: string;
  symptoms: string[];
  /** Legacy single mood id. Mirrors the primary (first) mood tag. */
  mood: string;
  isOvulation: boolean;
  /** Overall valence 1-5; 0 means not set. Optional: absent in old backups. */
  moodValence?: number;
  /** Multi-select feeling tags with intensity; optional: absent in old backups. */
  moodTags?: MoodTag[];
}

export interface PeriodData {
  periods: string[];
  ovulationDays: string[];
  symptoms: { [date: string]: string[] };
  moods: { [date: string]: string };
}

/**
 * Private intimacy log. This intentionally lives in its own table instead of
 * being folded into `daily_data`: the main calendar, insights, seed data and
 * backup envelope must not read it unless the user explicitly opts in.
 */
export type ProtectionMethod = '' | 'protected' | 'unprotected' | 'na';

export interface IntimateDay {
  date: string;
  protection: ProtectionMethod;
  note: string;
}

export interface IntimateData {
  [date: string]: IntimateDay;
}

const PROTECTION_METHODS: ProtectionMethod[] = ['', 'protected', 'unprotected', 'na'];

export const normalizeProtection = (value: unknown): ProtectionMethod =>
  typeof value === 'string' && (PROTECTION_METHODS as string[]).includes(value)
    ? (value as ProtectionMethod)
    : '';

/**
 * Whether a day holds anything worth keeping. A fully cleared day must have
 * no row at all: empty rows used to linger and kept the calendar's grey
 * "No Period" mark (and Track's "Has Data" badge) alive after the user had
 * deleted the data back out.
 */
export const dayHasContent = (data: DailyData): boolean =>
  data.isPeriod ||
  data.isOvulation ||
  (data.flowLevel ?? '') !== '' ||
  (data.symptoms?.length ?? 0) > 0 ||
  (data.mood ?? '') !== '' ||
  (data.moodValence ?? 0) > 0 ||
  (data.moodTags?.length ?? 0) > 0;

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
    name: 'add_ovulation_flag',
    up: async (db) => {
      await addColumnIfMissing(db, 'daily_data', 'is_ovulation', 'INTEGER NOT NULL DEFAULT 0');
    },
  },
  {
    version: 3,
    name: 'mood_detail',
    up: async (db) => {
      // Overall valence (1-5, 0 = not set) and multi-select feeling tags.
      await addColumnIfMissing(db, 'daily_data', 'mood_valence', 'INTEGER NOT NULL DEFAULT 0');
      await addColumnIfMissing(db, 'daily_data', 'mood_tags', "TEXT NOT NULL DEFAULT '[]'");
    },
  },
  {
    version: 4,
    name: 'remove_empty_day_rows',
    up: async (db) => {
      // Older versions kept a row for every saved day, even after the user
      // cleared it. Those empty rows made the calendar keep its grey
      // "No Period" mark; a day with nothing tracked should have no row.
      await db.runAsync(
        `DELETE FROM daily_data
         WHERE is_period = 0
           AND is_ovulation = 0
           AND flow_level = ''
           AND symptoms = '[]'
           AND mood = ''
           AND mood_valence = 0
           AND mood_tags = '[]'`
      );
    },
  },
  {
    version: 5,
    name: 'intimate_data',
    up: async (db) => {
      // A row means activity was logged for that local day. `activity` is kept
      // explicit so a future "no activity" marker can be added without a
      // breaking table rewrite; today every saved row sets it to 1.
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS intimate_data (
          date TEXT PRIMARY KEY,
          activity INTEGER NOT NULL DEFAULT 1,
          protection TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT ''
        );
      `);
    },
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

class SQLiteDataService {
  private db: SQLite.SQLiteDatabase | null = null;
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

      await this.db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
      `);

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
    
    return this.db;
  }

  /** Recorded period start days (first day of each consecutive period run), ascending. */
  private async queryPeriodStarts(db: SQLite.SQLiteDatabase): Promise<string[]> {
    const rows = await db.getAllAsync(`
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
    `) as { date: string }[];
    return rows.map(row => row.date);
  }

  /** Recorded ovulation days, ascending. */
  private async queryOvulationDays(db: SQLite.SQLiteDatabase): Promise<string[]> {
    const rows = await db.getAllAsync(
      'SELECT date FROM daily_data WHERE is_ovulation = 1 ORDER BY date'
    ) as { date: string }[];
    return rows.map(row => row.date);
  }

  async getPeriodData(): Promise<PeriodData> {
    try {
      const db = await this.ensureInitialized();
      
      const periodsResult = await db.getAllAsync(
        'SELECT date FROM daily_data WHERE is_period = 1 ORDER BY date'
      ) as { date: string }[];

      const ovulationDays = await this.queryOvulationDays(db);
      
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

      return { periods, ovulationDays, symptoms, moods };
    } catch (error) {
      console.error('Error loading period data:', error);
      return { periods: [], ovulationDays: [], symptoms: {}, moods: {} };
    }
  }

  async saveTodayData(dateKey: string, data: DailyData): Promise<void> {
    try {
      console.log('Attempting to save data for date:', dateKey);
      const db = await this.ensureInitialized();
      
      if (!db) {
        throw new Error('Database connection is null');
      }

      // Clearing every field deletes the day's row instead of leaving an
      // empty one behind (see dayHasContent).
      if (!dayHasContent(data)) {
        await db.runAsync('DELETE FROM daily_data WHERE date = ?', [dateKey]);
        console.log('Removed empty day for date:', dateKey);
        return;
      }

      const symptoms = JSON.stringify(data.symptoms || []);
      const flowLevel = data.flowLevel || '';
      const mood = data.mood || '';
      const moodValence = data.moodValence || 0;
      const moodTags = serializeMoodTags(data.moodTags || []);

      console.log('Saving data:', {
        dateKey,
        isPeriod: data.isPeriod,
        flowLevel,
        symptoms,
        mood,
        isOvulation: data.isOvulation
      });

      await db.runAsync(
        `INSERT OR REPLACE INTO daily_data
         (date, is_period, flow_level, symptoms, mood, mood_valence, mood_tags, is_ovulation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dateKey,
          data.isPeriod ? 1 : 0,
          flowLevel,
          symptoms,
          mood,
          moodValence,
          moodTags,
          data.isOvulation ? 1 : 0
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

  /**
   * Insert or replace many days in a single transaction. Useful for restoring
   * backups and seeding demo data, where per-row round trips are wasteful.
   */
  async saveManyDailyData(data: { [date: string]: DailyData }): Promise<void> {
    const entries = Object.entries(data);
    if (entries.length === 0) return;

    const db = await this.ensureInitialized();

    await db.withTransactionAsync(async () => {
      for (const [dateKey, day] of entries) {
        if (!dayHasContent(day)) continue; // no content -> no row
        await db.runAsync(
          `INSERT OR REPLACE INTO daily_data
           (date, is_period, flow_level, symptoms, mood, mood_valence, mood_tags, is_ovulation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dateKey,
            day.isPeriod ? 1 : 0,
            day.flowLevel || '',
            JSON.stringify(day.symptoms || []),
            day.mood || '',
            day.moodValence || 0,
            serializeMoodTags(day.moodTags || []),
            day.isOvulation ? 1 : 0,
          ]
        );
      }
    });
  }

  /**
   * Update only the mood fields for a day (valence + tags + legacy primary
   * mood id). Used by the mood picker's auto-save so period/symptom edits a
   * user has in progress are never overwritten. Creates the row if the day
   * has no data yet, and removes it again when the mood is cleared and
   * nothing else remains.
   */
  async saveMoodData(
    dateKey: string,
    mood: { mood: string; moodValence: number; moodTags: MoodTag[] }
  ): Promise<void> {
    try {
      const db = await this.ensureInitialized();

      await db.runAsync(
        `INSERT INTO daily_data
         (date, is_period, flow_level, symptoms, mood, mood_valence, mood_tags)
         VALUES (?, 0, '', '[]', ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
           mood = excluded.mood,
           mood_valence = excluded.mood_valence,
           mood_tags = excluded.mood_tags`,
        [
          dateKey,
          mood.mood || '',
          mood.moodValence || 0,
          serializeMoodTags(mood.moodTags || [])
        ]
      );

      // Clearing the mood may leave a row with nothing else in it; drop it so
      // the day stops looking tracked (calendar mark, Track "Has Data" badge).
      const moodIsEmpty =
        !mood.mood && !(mood.moodValence ?? 0) && (mood.moodTags?.length ?? 0) === 0;
      if (moodIsEmpty) {
        await db.runAsync(
          `DELETE FROM daily_data
           WHERE date = ?
             AND is_period = 0
             AND is_ovulation = 0
             AND flow_level = ''
             AND symptoms = '[]'
             AND mood = ''
             AND mood_valence = 0
             AND mood_tags = '[]'`,
          [dateKey]
        );
      }
    } catch (error) {
      console.error('Error saving mood data for date', dateKey, ':', error);
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
        is_ovulation: number;
        mood_valence: number;
        mood_tags: string;
      } | null;

      if (!result) return null;

      return {
        date: result.date,
        isPeriod: result.is_period === 1,
        flowLevel: result.flow_level,
        symptoms: JSON.parse(result.symptoms),
        mood: result.mood,
        isOvulation: result.is_ovulation === 1,
        moodValence: result.mood_valence ?? 0,
        moodTags: parseMoodTags(result.mood_tags),
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
        is_ovulation: number;
        mood_valence: number;
        mood_tags: string;
      }[];

      const dailyData: { [date: string]: DailyData } = {};

      results.forEach(row => {
        dailyData[row.date] = {
          date: row.date,
          isPeriod: row.is_period === 1,
          flowLevel: row.flow_level,
          symptoms: JSON.parse(row.symptoms),
          mood: row.mood,
          isOvulation: row.is_ovulation === 1,
          moodValence: row.mood_valence ?? 0,
          moodTags: parseMoodTags(row.mood_tags),
        };
      });

      return dailyData;
    } catch (error) {
      console.error('Error loading daily data:', error);
      return {};
    }
  }

  /** Private log, keyed by local day. Never merge this into `daily_data`. */
  async getIntimateData(): Promise<IntimateData> {
    try {
      const db = await this.ensureInitialized();
      const rows = await db.getAllAsync(
        `SELECT date, protection, note
         FROM intimate_data
         WHERE activity = 1
         ORDER BY date`
      ) as { date: string; protection: string; note: string }[];

      const data: IntimateData = {};
      rows.forEach(row => {
        data[row.date] = {
          date: row.date,
          protection: normalizeProtection(row.protection),
          note: row.note ?? '',
        };
      });
      return data;
    } catch (error) {
      console.error('Error loading private calendar data:', error);
      return {};
    }
  }

  /**
   * Save one private day. The presence of a row is what marks activity; a
   * cleared day must use `deleteIntimateDay` instead so the calendar doesn't
   * show an empty mark. Do not log protection/note contents here.
   */
  async saveIntimateDay(day: IntimateDay): Promise<void> {
    try {
      const db = await this.ensureInitialized();
      await db.runAsync(
        `INSERT OR REPLACE INTO intimate_data (date, activity, protection, note)
         VALUES (?, 1, ?, ?)`,
        [day.date, normalizeProtection(day.protection), day.note ?? '']
      );
    } catch (error) {
      console.error('Error saving private calendar entry:', error);
      throw error;
    }
  }

  async deleteIntimateDay(dateKey: string): Promise<void> {
    try {
      const db = await this.ensureInitialized();
      await db.runAsync('DELETE FROM intimate_data WHERE date = ?', [dateKey]);
    } catch (error) {
      console.error('Error deleting private calendar entry:', error);
      throw error;
    }
  }

  async saveManyIntimateData(data: IntimateData): Promise<void> {
    const entries = Object.entries(data);
    if (entries.length === 0) return;

    const db = await this.ensureInitialized();
    await db.withTransactionAsync(async () => {
      for (const [dateKey, day] of entries) {
        await db.runAsync(
          `INSERT OR REPLACE INTO intimate_data (date, activity, protection, note)
           VALUES (?, 1, ?, ?)`,
          [dateKey, normalizeProtection(day.protection), day.note ?? '']
        );
      }
    });
  }

  async getInsights() {
    try {
      const db = await this.ensureInitialized();
      
      const periodStarts = await this.queryPeriodStarts(db);
      const ovulationDays = await this.queryOvulationDays(db);
      const today = new Date();
      const todayKey = formatDateKey(today);
      
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

      // Calculate next period prediction. Use the same first prediction as the
      // calendar (local day keys) instead of mixing UTC-parsed dates with local
      // midnight, which was a day off in negative-offset timezones.
      let nextPeriodIn = 0;
      const nextPredicted = predictPeriodStarts(periodStarts)[0];
      if (nextPredicted) {
        nextPeriodIn = daysBetween(parseDateKey(todayKey), parseDateKey(nextPredicted));
      }

      // Symptom patterns: the raw day list is grouped by cycle phase in a pure
      // helper so the chart shows when symptoms occur, not just how often.
      const trackedDaysResult = await db.getFirstAsync(
        'SELECT COUNT(*) as count FROM daily_data'
      ) as { count: number } | null;
      const trackedDays = trackedDaysResult?.count ?? 0;

      const symptomRows = await db.getAllAsync(`
        SELECT date, symptoms
        FROM daily_data
        WHERE symptoms != '[]'
        ORDER BY date
      `) as { date: string; symptoms: string }[];

      const symptomDays: SymptomDay[] = [];
      for (const row of symptomRows) {
        try {
          const parsed = JSON.parse(row.symptoms);
          if (Array.isArray(parsed)) {
            symptomDays.push({ date: row.date, symptoms: parsed });
          }
        } catch (error) {
          console.error('Error parsing symptoms:', error);
        }
      }

      const symptomPatterns = summarizeSymptomPatterns(
        symptomDays,
        periodStarts,
        trackedDays,
        { ovulationDays }
      ).patterns;

      // Mood detail: every day with valence or feeling tags feeds the phase
      // summary; the last 60 calendar days feed the valence trend chart.
      const moodRows = await db.getAllAsync(`
        SELECT date, is_period, mood_valence, mood_tags
        FROM daily_data
        WHERE mood_valence > 0 OR mood_tags != '[]'
        ORDER BY date
      `) as { date: string; is_period: number; mood_valence: number; mood_tags: string }[];

      const moodDays: MoodDay[] = moodRows.map(row => ({
        date: row.date,
        valence: row.mood_valence ?? 0,
        tags: parseMoodTags(row.mood_tags),
      }));

      const seriesStartKey = formatDateKey(addDays(today, -(MOOD_SERIES_DAYS - 1)));
      const seriesRows = await db.getAllAsync(
        'SELECT date, is_period, mood_valence FROM daily_data WHERE date >= ? ORDER BY date',
        [seriesStartKey]
      ) as { date: string; is_period: number; mood_valence: number }[];

      const seriesByDate = new Map(
        seriesRows.map(row => [
          row.date,
          { valence: row.mood_valence ?? 0, isPeriod: row.is_period === 1 },
        ] as const)
      );

      const moodSeries = buildMoodSeries(seriesByDate, today);
      const moodPhases = summarizeMoodByPhase(moodDays, periodStarts, ovulationDays);

      return {
        averageCycle,
        lastPeriodLength,
        nextPeriodIn,
        totalPeriods: periodStarts.length,
        moodSeries,
        moodPhases,
        periodStarts,
        ovulationDays,
        symptomPatterns,
        trackedDays,
      };
    } catch (error) {
      console.error('Error calculating insights:', error);
      return {
        averageCycle: 28,
        lastPeriodLength: 0,
        nextPeriodIn: 0,
        totalPeriods: 0,
        moodSeries: [],
        moodPhases: [],
        periodStarts: [],
        ovulationDays: [],
        symptomPatterns: [],
        trackedDays: 0,
      };
    }
  }

  /**
   * Ovulation + fertile-window forecast derived from recorded data. The math
   * itself is pure (see FertilityService); this only loads the raw day lists.
   */
  async getFertilityForecast(): Promise<FertilityForecast> {
    try {
      const db = await this.ensureInitialized();
      const periodStarts = await this.queryPeriodStarts(db);
      const ovulationDays = await this.queryOvulationDays(db);

      return computeFertilityForecast({
        periodStarts,
        ovulationDays,
        today: new Date(),
      });
    } catch (error) {
      console.error('Error calculating fertility forecast:', error);
      return computeFertilityForecast({ periodStarts: [], ovulationDays: [], today: new Date() });
    }
  }

  /**
   * Restore replaces cycle data and private data independently: an older
   * backup without an `intimateData` section must not silently erase the
   * private log the user still has on this device.
   */
  async clearDailyData(): Promise<void> {
    try {
      const db = await this.ensureInitialized();
      await db.runAsync('DELETE FROM daily_data');
    } catch (error) {
      console.error('Error clearing daily data:', error);
      throw error;
    }
  }

  async clearIntimateData(): Promise<void> {
    try {
      const db = await this.ensureInitialized();
      await db.runAsync('DELETE FROM intimate_data');
    } catch (error) {
      console.error('Error clearing private calendar data:', error);
      throw error;
    }
  }

  async clearAllData(): Promise<void> {
    try {
      const db = await this.ensureInitialized();
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM daily_data');
        await db.runAsync('DELETE FROM intimate_data');
      });
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
             (date, is_period, flow_level, symptoms, mood, is_ovulation)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              date,
              data.isPeriod ? 1 : 0,
              data.flowLevel || '',
              JSON.stringify(data.symptoms || []),
              data.mood || '',
              data.isOvulation ? 1 : 0
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

export class DataService {
  static formatDateKey = formatDateKey;

  static async getPeriodData(): Promise<PeriodData> {
    return sqliteDataService.getPeriodData();
  }

  static async saveTodayData(dateKey: string, data: DailyData): Promise<void> {
    return sqliteDataService.saveTodayData(dateKey, data);
  }

  static async saveManyDailyData(data: { [date: string]: DailyData }): Promise<void> {
    return sqliteDataService.saveManyDailyData(data);
  }

  static async saveMoodData(
    dateKey: string,
    mood: { mood: string; moodValence: number; moodTags: MoodTag[] }
  ): Promise<void> {
    return sqliteDataService.saveMoodData(dateKey, mood);
  }

  static async getTodayData(dateKey: string): Promise<DailyData | null> {
    return sqliteDataService.getTodayData(dateKey);
  }

  static async getAllDailyData(): Promise<{ [date: string]: DailyData }> {
    return sqliteDataService.getAllDailyData();
  }

  static async getIntimateData(): Promise<IntimateData> {
    return sqliteDataService.getIntimateData();
  }

  static async saveIntimateDay(day: IntimateDay): Promise<void> {
    return sqliteDataService.saveIntimateDay(day);
  }

  static async deleteIntimateDay(dateKey: string): Promise<void> {
    return sqliteDataService.deleteIntimateDay(dateKey);
  }

  static async saveManyIntimateData(data: IntimateData): Promise<void> {
    return sqliteDataService.saveManyIntimateData(data);
  }

  static async clearDailyData(): Promise<void> {
    return sqliteDataService.clearDailyData();
  }

  static async clearIntimateData(): Promise<void> {
    return sqliteDataService.clearIntimateData();
  }

  static async getInsights() {
    return sqliteDataService.getInsights();
  }

  static async getFertilityForecast(): Promise<FertilityForecast> {
    return sqliteDataService.getFertilityForecast();
  }

  static async clearAllData(): Promise<void> {
    return sqliteDataService.clearAllData();
  }

  static async migrateFromAsyncStorage(): Promise<void> {
    return sqliteDataService.migrateFromAsyncStorage();
  }
}