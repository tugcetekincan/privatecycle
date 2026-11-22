import { DataService, dayHasContent, normalizeProtection, DailyData } from '@/services/DataService';
import * as SQLite from 'expo-sqlite';

describe('DataService.formatDateKey', () => {
  it('formats local dates as zero-padded YYYY-MM-DD', () => {
    expect(DataService.formatDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(DataService.formatDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('does not shift dates across timezone boundaries', () => {
    // A date constructed from local parts must round-trip through the key.
    const date = new Date(2026, 5, 15, 23, 59, 59);
    expect(DataService.formatDateKey(date)).toBe('2026-06-15');
  });
});

describe('normalizeProtection', () => {
  it('keeps known protection methods', () => {
    expect(normalizeProtection('')).toBe('');
    expect(normalizeProtection('protected')).toBe('protected');
    expect(normalizeProtection('unprotected')).toBe('unprotected');
    expect(normalizeProtection('na')).toBe('na');
  });

  it('falls back for unknown or non-string values', () => {
    expect(normalizeProtection('other')).toBe('');
    expect(normalizeProtection(null)).toBe('');
    expect(normalizeProtection(1)).toBe('');
  });
});

describe('DataService.getNotificationStats', () => {
  it('returns empty stats for an empty database', async () => {
    await expect(DataService.getNotificationStats()).resolves.toEqual({
      periodStarts: [],
      ovulationDays: [],
      periodDays: [],
      trackedDays: 0,
    });
  });
});

describe('DataService.getTrackedDayCount', () => {
  it('returns zero for an empty database', async () => {
    await expect(DataService.getTrackedDayCount()).resolves.toBe(0);
  });
});

describe('DataService.getInsights recentMoods', () => {
  it('keeps the latest five all-history entries in order, including legacy and tags-only rows', async () => {
    await DataService.getTrackedDayCount();
    const db = (await SQLite.openDatabaseAsync('test')) as any;
    const originalGetAll = db.getAllAsync;
    const originalGetFirst = db.getFirstAsync;

    const moodRows = [
      {
        date: '2024-12-31',
        is_period: 0,
        mood: 'happy',
        mood_valence: 0,
        mood_tags: '[]',
      },
      {
        date: '2025-01-02',
        is_period: 0,
        mood: 'calm',
        mood_valence: 0,
        mood_tags: '[]',
      },
      {
        date: '2025-02-03',
        is_period: 0,
        mood: '',
        mood_valence: 0,
        mood_tags: '[{"id":"tired","level":1}]',
      },
      {
        date: '2025-03-04',
        is_period: 0,
        mood: '',
        mood_valence: 4,
        mood_tags: '[]',
      },
      {
        date: '2025-04-05',
        is_period: 0,
        mood: 'calm',
        mood_valence: 3,
        mood_tags: '[{"id":"calm","level":2}]',
      },
      {
        date: '2025-05-06',
        is_period: 0,
        mood: '',
        mood_valence: 2,
        mood_tags: '[{"id":"low","level":1}]',
      },
    ];

    db.getAllAsync = jest.fn(async (sql: string) => {
      if (sql.includes('WITH period_days')) return [];
      if (sql.includes('is_ovulation = 1')) return [];
      if (sql.includes('is_period = 1')) return [];
      if (sql.includes('WHERE symptoms !=')) return [];
      if (sql.includes('mood_valence > 0 OR mood_tags')) return moodRows;
      return [];
    });
    db.getFirstAsync = jest.fn(async () => ({ count: moodRows.length }));

    try {
      const insights = await DataService.getInsights();

      expect(insights.recentMoods.map((entry) => entry.date)).toEqual([
        '2025-01-02',
        '2025-02-03',
        '2025-03-04',
        '2025-04-05',
        '2025-05-06',
      ]);
      expect(insights.recentMoods[0]).toMatchObject({
        valence: 0,
        tags: [],
        legacyMood: 'calm',
      });
      expect(insights.recentMoods[1]).toMatchObject({
        valence: 0,
        tags: [{ id: 'tired', level: 1 }],
        legacyMood: '',
      });
      expect(insights.moodSeries.filter((point) => point.valence > 0)).toHaveLength(0);
      expect(insights.trackedDays).toBe(moodRows.length);
    } finally {
      db.getAllAsync = originalGetAll;
      db.getFirstAsync = originalGetFirst;
    }
  });
});

describe('dayHasContent', () => {
  const emptyDay: DailyData = {
    date: '2026-10-16',
    isPeriod: false,
    flowLevel: '',
    symptoms: [],
    mood: '',
    isOvulation: false,
    moodValence: 0,
    moodTags: [],
  };

  it('is false for a fully cleared day', () => {
    expect(dayHasContent(emptyDay)).toBe(false);
  });

  it('is false when the optional mood fields are absent (old backups)', () => {
    const legacyDay: DailyData = {
      date: '2026-10-16',
      isPeriod: false,
      flowLevel: '',
      symptoms: [],
      mood: '',
      isOvulation: false,
    };
    expect(dayHasContent(legacyDay)).toBe(false);
  });

  it('is true when any tracked field is set', () => {
    expect(dayHasContent({ ...emptyDay, isPeriod: true })).toBe(true);
    expect(dayHasContent({ ...emptyDay, isOvulation: true })).toBe(true);
    expect(dayHasContent({ ...emptyDay, flowLevel: 'medium' })).toBe(true);
    expect(dayHasContent({ ...emptyDay, symptoms: ['cramps'] })).toBe(true);
    expect(dayHasContent({ ...emptyDay, mood: 'calm' })).toBe(true);
    expect(dayHasContent({ ...emptyDay, moodValence: 3 })).toBe(true);
    expect(dayHasContent({ ...emptyDay, moodTags: [{ id: 'calm', level: 1 }] })).toBe(true);
  });
});
