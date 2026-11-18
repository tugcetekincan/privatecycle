import {
  buildBleedingRuns,
  emptyBleedingSummary,
  PERIOD_LENGTH_MAX_DAYS,
  PERIOD_LENGTH_MIN_DAYS,
  STANDARD_PERIOD_LENGTH_DAYS,
  summarizeBleedingRuns,
  summarizePeriodDays,
  toPeriodRunContext,
} from '@/services/BleedingModel';

const today = '2026-11-18';

describe('buildBleedingRuns', () => {
  it('groups consecutive days and sorts unsorted input', () => {
    const runs = buildBleedingRuns(['2026-11-03', '2026-11-01', '2026-11-02', '2026-11-10'], today);

    expect(runs).toEqual([
      { start: '2026-11-01', end: '2026-11-03', days: 3, active: false },
      { start: '2026-11-10', end: '2026-11-10', days: 1, active: false },
    ]);
  });

  it('does not merge a one-day gap', () => {
    const runs = buildBleedingRuns(['2026-11-01', '2026-11-03'], today);
    expect(runs).toHaveLength(2);
  });

  it('marks the run containing today as active', () => {
    const runs = buildBleedingRuns(['2026-11-16', '2026-11-17', '2026-11-18'], today);
    expect(runs).toEqual([
      { start: '2026-11-16', end: '2026-11-18', days: 3, active: true },
    ]);
  });

  it('handles duplicate days and malformed keys', () => {
    const runs = buildBleedingRuns(
      ['2026-11-01', '2026-11-01', 'not-a-date', '2026-11-02'],
      today
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].days).toBe(2);
  });
});

describe('summarizeBleedingRuns', () => {
  it('uses the standard fallback with fewer than two complete runs', () => {
    const summary = summarizePeriodDays(['2026-11-01', '2026-11-02'], today);

    expect(summary.basis).toBe('standard');
    expect(summary.typicalDays).toBeNull();
    expect(summary.predictionDays).toBe(STANDARD_PERIOD_LENGTH_DAYS);
    expect(summary.sampleSize).toBe(1);
    expect(summary.lastPeriod?.days).toBe(2);
  });

  it('learns the median of recent complete runs', () => {
    const summary = summarizePeriodDays(
      [
        '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05',
        '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
        '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31',
        '2026-11-01',
      ],
      today
    );

    // 5, 4 and 6 days -> median 5.
    expect(summary.basis).toBe('recorded');
    expect(summary.typicalDays).toBe(5);
    expect(summary.predictionDays).toBe(5);
    expect(summary.sampleSize).toBe(3);
    expect(summary.rawMedianDays).toBe(5);
    expect(summary.clamped).toBe(false);
  });

  it('excludes an active run from the learned value', () => {
    const summary = summarizePeriodDays(
      [
        '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
        '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
        '2026-11-16', '2026-11-17', '2026-11-18',
      ],
      today
    );

    expect(summary.typicalDays).toBe(4);
    expect(summary.sampleSize).toBe(2);
    expect(summary.lastPeriod).toMatchObject({ start: '2026-11-16', days: 3, active: true });
    expect(summary.runDaysByStart['2026-11-16']).toBe(3);
  });

  it('clamps a very short median to the supported minimum', () => {
    const summary = summarizePeriodDays(
      ['2026-10-01', '2026-10-28', '2026-11-01'],
      today
    );

    expect(summary.typicalDays).toBe(PERIOD_LENGTH_MIN_DAYS);
    expect(summary.clamped).toBe(true);
  });

  it('clamps a very long median to the supported maximum', () => {
    const summary = summarizeBleedingRuns([
      { start: '2026-09-01', end: '2026-09-12', days: 12, active: false },
      { start: '2026-10-01', end: '2026-10-12', days: 12, active: false },
    ]);

    expect(summary.typicalDays).toBe(PERIOD_LENGTH_MAX_DAYS);
    expect(summary.clamped).toBe(true);
  });

  it('only learns from the most recent six complete runs', () => {
    const runs = Array.from({ length: 8 }, (_, index) => ({
      start: `2026-0${index + 1}-01`,
      end: `2026-0${index + 1}-02`,
      days: index + 1,
      active: false,
    }));

    const summary = summarizeBleedingRuns(runs, { limit: 6 });

    // The last six runs are 3, 4, 5, 6, 7, 8 -> median 5.5 -> 6.
    expect(summary.sampleSize).toBe(6);
    expect(summary.typicalDays).toBe(6);
  });

  it('returns an empty summary without period days', () => {
    expect(summarizePeriodDays([], today)).toEqual(emptyBleedingSummary());
  });
});

describe('toPeriodRunContext', () => {
  it('flattens the summary for the cycle model', () => {
    const summary = summarizePeriodDays(
      ['2026-11-16', '2026-11-17', '2026-11-18', '2026-10-01', '2026-10-02'],
      today
    );

    expect(toPeriodRunContext(summary)).toEqual({
      periodRunDays: summary.runDaysByStart,
      periodLengthDays: 5,
      activePeriodStart: '2026-11-16',
    });
  });
});
