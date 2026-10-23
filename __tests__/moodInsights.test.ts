import { buildMoodSeries, MoodDay, phaseForDate, summarizeMoodByPhase } from '@/services/MoodInsights';

describe('phaseForDate', () => {
  const starts = ['2026-06-01'];

  it.each([
    ['2026-06-01', 'menstrual'], // day 0
    ['2026-06-06', 'menstrual'], // day 5
    ['2026-06-07', 'follicular'], // day 6
    ['2026-06-14', 'follicular'], // day 13
    ['2026-06-15', 'ovulation'], // day 14
    ['2026-06-17', 'ovulation'], // day 16
    ['2026-06-18', 'luteal'], // day 17
  ] as const)('%s -> %s', (date, phase) => {
    expect(phaseForDate(date, starts)).toBe(phase);
  });

  it('returns null for days before the first recorded start', () => {
    expect(phaseForDate('2026-05-31', starts)).toBeNull();
  });

  it('uses the most recent start at or before the day', () => {
    expect(phaseForDate('2026-07-02', ['2026-06-01', '2026-06-29'])).toBe('menstrual');
  });

  it('uses recorded luteal lengths instead of fixed day-14 thresholds', () => {
    const starts = ['2026-05-01', '2026-05-31']; // 30-day cycle
    const ovulations = ['2026-05-21']; // 10-day luteal -> ovulation Jun 20

    expect(phaseForDate('2026-06-17', starts, ovulations)).toBe('follicular');
    expect(phaseForDate('2026-06-20', starts, ovulations)).toBe('ovulation');
    expect(phaseForDate('2026-06-21', starts, ovulations)).toBe('ovulation');
    expect(phaseForDate('2026-06-23', starts, ovulations)).toBe('luteal');
  });
});

describe('summarizeMoodByPhase', () => {
  it('averages valence and ranks feelings per phase', () => {
    const days: MoodDay[] = [
      // menstrual
      { date: '2026-06-02', valence: 2, tags: [{ id: 'anxious', level: 2 }, { id: 'tired', level: 1 }] },
      { date: '2026-06-03', valence: 4, tags: [{ id: 'tired', level: 3 }] },
      // follicular
      { date: '2026-06-10', valence: 5, tags: [] },
      // luteal
      { date: '2026-06-25', valence: 1, tags: [{ id: 'anxious', level: 3 }] },
      // before the first start and mood-less days are excluded
      { date: '2026-05-30', valence: 3, tags: [] },
      { date: '2026-06-11', valence: 0, tags: [] },
    ];

    const summary = summarizeMoodByPhase(days, ['2026-06-01']);

    expect(summary.map((entry) => entry.phase)).toEqual(['menstrual', 'follicular', 'luteal']);

    const menstrual = summary[0];
    expect(menstrual.days).toBe(2);
    expect(menstrual.averageValence).toBeCloseTo(3);
    expect(menstrual.topTags).toEqual([
      { id: 'tired', averageLevel: 2, days: 2 },
      { id: 'anxious', averageLevel: 2, days: 1 },
    ]);

    const follicular = summary[1];
    expect(follicular.days).toBe(1);
    expect(follicular.averageValence).toBe(5);
    expect(follicular.topTags).toEqual([]);

    const luteal = summary[2];
    expect(luteal.averageValence).toBe(1);
    expect(luteal.topTags).toEqual([{ id: 'anxious', averageLevel: 3, days: 1 }]);
  });

  it('only returns phases that have mood data', () => {
    const summary = summarizeMoodByPhase(
      [{ date: '2026-06-25', valence: 2, tags: [] }],
      ['2026-06-01']
    );
    expect(summary).toHaveLength(1);
    expect(summary[0].phase).toBe('luteal');
  });

  it('groups a predicted-ovulation day as ovulation using recorded luteal lengths', () => {
    const summary = summarizeMoodByPhase(
      [{ date: '2026-06-20', valence: 4, tags: [] }],
      ['2026-05-01', '2026-05-31'],
      ['2026-05-21']
    );
    expect(summary.map((entry) => entry.phase)).toEqual(['ovulation']);
  });
});

describe('buildMoodSeries', () => {
  it('fills the range oldest to newest, unlogged days at valence 0', () => {
    const entries = new Map([
      ['2026-06-14', { valence: 4, isPeriod: true }],
      ['2026-06-15', { valence: 2, isPeriod: false }],
    ]);

    const series = buildMoodSeries(entries, new Date(2026, 5, 15), 3);

    expect(series).toEqual([
      { date: '2026-06-13', valence: 0, isPeriod: false },
      { date: '2026-06-14', valence: 4, isPeriod: true },
      { date: '2026-06-15', valence: 2, isPeriod: false },
    ]);
  });
});
