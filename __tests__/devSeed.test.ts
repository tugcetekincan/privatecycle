import { generateDemoDailyData } from '@/services/DevSeedService';
import { parseDevSeedAction } from '@/hooks/useDevSeed';

const END = new Date(2026, 5, 15); // 2026-06-15, local time

function keyFor(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

describe('generateDemoDailyData', () => {
  it('is deterministic for the same options', () => {
    const a = generateDemoDailyData({ days: 60, endDate: END, seed: 42 });
    const b = generateDemoDailyData({ days: 60, endDate: END, seed: 42 });
    expect(a).toEqual(b);
  });

  it('produces exactly one entry per day ending on endDate', () => {
    const days = 60;
    const data = generateDemoDailyData({ days, endDate: END });

    expect(Object.keys(data)).toHaveLength(days);
    expect(data['2026-06-15']).toBeDefined();

    const first = new Date(END);
    first.setDate(first.getDate() - (days - 1));
    expect(data[keyFor(first)]).toBeDefined();
  });

  it('produces period runs with valid flow levels and no flow on other days', () => {
    const data = generateDemoDailyData({ days: 90, endDate: END, seed: 7 });
    const all = Object.values(data);
    const periodDays = all.filter((d) => d.isPeriod);

    expect(periodDays.length).toBeGreaterThan(10);
    for (const day of periodDays) {
      expect(['light', 'medium', 'heavy']).toContain(day.flowLevel);
    }
    for (const day of all.filter((d) => !d.isPeriod)) {
      expect(day.flowLevel).toBe('');
    }
  });

  it('sets a mood on every generated day', () => {
    const data = generateDemoDailyData({ days: 30, endDate: END });
    for (const day of Object.values(data)) {
      expect(day.mood).not.toBe('');
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('parseDevSeedAction', () => {
  it.each([
    ['', null],
    ['?seed=1', 'seed'],
    ['?seed=force', 'force'],
    ['?reset=1', 'reset'],
    ['?seed=nope', null],
    ['?foo=bar&seed=force', 'force'],
  ] as const)('parses %s', (search, expected) => {
    expect(parseDevSeedAction(search)).toBe(expected);
  });
});
