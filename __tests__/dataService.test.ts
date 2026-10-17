import { DataService, dayHasContent, DailyData } from '@/services/DataService';

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
