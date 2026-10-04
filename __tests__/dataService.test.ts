import { DataService } from '@/services/DataService';

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
