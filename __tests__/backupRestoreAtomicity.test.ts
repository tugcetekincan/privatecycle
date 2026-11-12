import * as SQLite from 'expo-sqlite';
import {
  SQLiteDataService,
  DailyData,
  IntimateData,
} from '@/services/DataService';

/**
 * A small in-memory stand-in for expo-sqlite that models the one property this
 * test cares about: `withTransactionAsync` rolls the whole callback back when
 * any statement throws. The real SQLite engine guarantees the same.
 */
class FakeDatabase {
  daily = new Map<string, unknown[]>();
  intimate = new Map<string, unknown[]>();
  failDailyInsertAt: number | null = null;
  failIntimateInsertAt: number | null = null;
  transactions = 0;

  async execAsync(): Promise<void> {
    // PRAGMA setup and migrations are skipped by the user_version below.
  }

  async getFirstAsync(sql: string): Promise<unknown> {
    if (sql.includes('PRAGMA user_version')) {
      return { user_version: 999 };
    }
    return null;
  }

  async getAllAsync(): Promise<unknown[]> {
    return [];
  }

  async runAsync(sql: string, params: unknown[] = []): Promise<void> {
    if (sql.includes('DELETE FROM daily_data')) {
      this.daily.clear();
      return;
    }

    if (sql.includes('DELETE FROM intimate_data')) {
      this.intimate.clear();
      return;
    }

    if (sql.includes('INSERT OR REPLACE INTO daily_data')) {
      if (
        this.failDailyInsertAt !== null &&
        this.daily.size >= this.failDailyInsertAt
      ) {
        throw new Error('simulated daily write failure');
      }
      this.daily.set(String(params[0]), params);
      return;
    }

    if (sql.includes('INSERT OR REPLACE INTO intimate_data')) {
      if (
        this.failIntimateInsertAt !== null &&
        this.intimate.size >= this.failIntimateInsertAt
      ) {
        throw new Error('simulated private write failure');
      }
      this.intimate.set(String(params[0]), params);
    }
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.transactions += 1;
    const dailySnapshot = new Map(this.daily);
    const intimateSnapshot = new Map(this.intimate);

    try {
      await task();
    } catch (error) {
      this.daily = dailySnapshot;
      this.intimate = intimateSnapshot;
      throw error;
    }
  }
}

const day = (date: string): DailyData => ({
  date,
  isPeriod: true,
  flowLevel: 'medium',
  symptoms: ['cramps'],
  mood: 'calm',
  isOvulation: false,
});

const privateDay = (date: string): IntimateData[string] => ({
  date,
  protection: 'protected',
  note: 'private note',
});

const createService = (fake: FakeDatabase): SQLiteDataService =>
  new SQLiteDataService(
    async () => fake as unknown as SQLite.SQLiteDatabase
  );

describe('DataService.replaceAllData', () => {
  it('replaces cycle and private data inside one transaction', async () => {
    const fake = new FakeDatabase();
    fake.daily.set('2025-12-31', ['old']);
    fake.intimate.set('2025-12-31', ['old-private']);

    const service = createService(fake);
    await service.replaceAllData(
      {
        '2026-01-01': day('2026-01-01'),
        '2026-01-02': day('2026-01-02'),
      },
      { '2026-01-01': privateDay('2026-01-01') }
    );

    expect([...fake.daily.keys()].sort()).toEqual(['2026-01-01', '2026-01-02']);
    expect([...fake.intimate.keys()]).toEqual(['2026-01-01']);
    expect(fake.transactions).toBe(1);
  });

  it('keeps the private log when the backup omits it', async () => {
    const fake = new FakeDatabase();
    fake.daily.set('2025-12-31', ['old']);
    fake.intimate.set('2025-12-31', ['old-private']);

    const service = createService(fake);
    await service.replaceAllData({ '2026-01-01': day('2026-01-01') });

    expect([...fake.daily.keys()]).toEqual(['2026-01-01']);
    expect([...fake.intimate.keys()]).toEqual(['2025-12-31']);
    expect(fake.transactions).toBe(1);
  });

  it('clears cycle data for an empty backup and keeps the private log', async () => {
    const fake = new FakeDatabase();
    fake.daily.set('2025-12-31', ['old']);
    fake.intimate.set('2025-12-31', ['old-private']);

    const service = createService(fake);
    await service.replaceAllData({});

    expect(fake.daily.size).toBe(0);
    expect([...fake.intimate.keys()]).toEqual(['2025-12-31']);
    expect(fake.transactions).toBe(1);
  });

  it('writes a legacy day without isOvulation as not ovulating', async () => {
    const fake = new FakeDatabase();
    const service = createService(fake);
    const legacyDay = {
      date: '2026-01-01',
      isPeriod: true,
      flowLevel: 'medium',
      symptoms: ['cramps'],
      mood: 'calm',
    } as DailyData;

    await service.replaceAllData({ '2026-01-01': legacyDay });

    expect(fake.daily.get('2026-01-01')?.[7]).toBe(0);
  });

  it('restores the original cycle and private rows when a daily write fails', async () => {
    const fake = new FakeDatabase();
    fake.daily.set('2025-12-31', ['old']);
    fake.intimate.set('2025-12-31', ['old-private']);
    fake.failDailyInsertAt = 1; // first new day succeeds, second throws

    const service = createService(fake);

    await expect(
      service.replaceAllData(
        {
          '2026-01-01': day('2026-01-01'),
          '2026-01-02': day('2026-01-02'),
        },
        { '2026-01-01': privateDay('2026-01-01') }
      )
    ).rejects.toThrow('simulated daily write failure');

    expect([...fake.daily.keys()]).toEqual(['2025-12-31']);
    expect([...fake.intimate.keys()]).toEqual(['2025-12-31']);
    expect(fake.transactions).toBe(1);
  });

  it('restores the original cycle and private rows when a private write fails', async () => {
    const fake = new FakeDatabase();
    fake.daily.set('2025-12-31', ['old']);
    fake.intimate.set('2025-12-31', ['old-private']);
    fake.failIntimateInsertAt = 0;

    const service = createService(fake);

    await expect(
      service.replaceAllData(
        { '2026-01-01': day('2026-01-01') },
        { '2026-01-01': privateDay('2026-01-01') }
      )
    ).rejects.toThrow('simulated private write failure');

    expect([...fake.daily.keys()]).toEqual(['2025-12-31']);
    expect([...fake.intimate.keys()]).toEqual(['2025-12-31']);
    expect(fake.transactions).toBe(1);
  });
});
