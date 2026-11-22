import {
  cycleMetricHints,
  moodSectionState,
  patternReadiness,
} from '@/services/JournalReadiness';
import { MoodDay, MoodSeriesPoint } from '@/services/MoodInsights';
import { SymptomPattern } from '@/services/SymptomInsights';

const emptyPattern: SymptomPattern = {
  id: 'headache',
  days: 3,
  rate: 0.5,
  phaseDays: { menstrual: 0, follicular: 0, ovulation: 0, luteal: 0 },
  phaseShares: { menstrual: 0, follicular: 0, ovulation: 0, luteal: 0 },
  phasedDays: 0,
  dominantPhase: null,
  dominantShare: 0,
};

const phasedPattern: SymptomPattern = {
  ...emptyPattern,
  phaseDays: { menstrual: 0, follicular: 0, ovulation: 0, luteal: 3 },
  phasedDays: 3,
  dominantPhase: 'luteal',
  dominantShare: 1,
};

const ratedPoint = (date: string): MoodSeriesPoint => ({
  date,
  valence: 3,
  isPeriod: false,
});

const moodDay = (date: string, valence: number, tags: MoodDay['tags'] = []): MoodDay => ({
  date,
  valence,
  tags,
});

describe('cycleMetricHints', () => {
  it('names exactly what is missing with one period start', () => {
    expect(
      cycleMetricHints(1, { typicalDays: null, sampleSize: 0 })
    ).toEqual({
      average: '1 more period start',
      variation: '2 more period starts',
      typicalPeriod: 'Needs 2 completed periods',
    });
  });

  it('uses the recorded typical period once two runs exist', () => {
    expect(
      cycleMetricHints(2, { typicalDays: 5, sampleSize: 2 })
    ).toEqual({
      average: null,
      variation: '1 more period start',
      typicalPeriod: null,
    });
  });

  it('needs three starts for variation', () => {
    expect(
      cycleMetricHints(3, { typicalDays: null, sampleSize: 1 })
    ).toEqual({
      average: null,
      variation: null,
      typicalPeriod: 'Needs 1 more completed period',
    });
  });
});

describe('moodSectionState', () => {
  it('keeps tags-only entries visible without advancing the trend counter', () => {
    const state = moodSectionState({
      moodSeries: [],
      moodPhases: [],
      recentMoods: [
        moodDay('2026-11-19', 0, [{ id: 'calm', level: 1 }]),
        moodDay('2026-11-20', 0, [{ id: 'tired', level: 2 }]),
      ],
    });

    expect(state.hasEntries).toBe(true);
    expect(state.trend.ratedDays).toBe(0);
    expect(state.label).toBe('Recent entries');
    expect(state.trendCopy).toBe(
      '0 of 5 rated days in the last 60 days · 5 more for a trend'
    );
    expect(state.needsPhaseContext).toBe(true);
  });

  it('shows exact progress with three ratings', () => {
    const state = moodSectionState({
      moodSeries: ['a', 'b', 'c'].map(ratedPoint),
      moodPhases: [],
      recentMoods: ['2026-11-18', '2026-11-19', '2026-11-20'].map((date) =>
        moodDay(date, 3)
      ),
    });

    expect(state.trend.remaining).toBe(2);
    expect(state.label).toBe('Recent entries');
    expect(state.trendCopy).toBe(
      '3 of 5 rated days in the last 60 days · 2 more for a trend'
    );
  });

  it('labels a trend without phases truthfully', () => {
    const state = moodSectionState({
      moodSeries: ['a', 'b', 'c', 'd', 'e'].map(ratedPoint),
      moodPhases: [],
      recentMoods: ['a', 'b', 'c', 'd', 'e'].map((date) => moodDay(date, 4)),
    });

    expect(state.trend.ready).toBe(true);
    expect(state.label).toBe('Trend');
    expect(state.trendCopy).toBeNull();
    expect(state.needsPhaseContext).toBe(true);
  });

  it('keeps the phase label when phase summaries exist', () => {
    const state = moodSectionState({
      moodSeries: ['a', 'b', 'c', 'd', 'e'].map(ratedPoint),
      moodPhases: [
        { phase: 'follicular', days: 2, averageValence: 4, topTags: [] },
        { phase: 'luteal', days: 3, averageValence: 2, topTags: [] },
      ],
      recentMoods: [],
    });

    expect(state.label).toBe('Trend + phases');
    expect(state.hasPhaseContext).toBe(true);
  });

  it('labels tags-only phase summaries as feelings, not averages', () => {
    const state = moodSectionState({
      moodSeries: [],
      moodPhases: [
        {
          phase: 'luteal',
          days: 2,
          averageValence: null,
          topTags: [{ id: 'tired', averageLevel: 2, days: 2 }],
        },
      ],
      recentMoods: [moodDay('2026-11-20', 0, [{ id: 'tired', level: 2 }])],
    });

    expect(state.label).toBe('Feelings by phase');
  });
});

describe('patternReadiness', () => {
  it('distinguishes a missing log from missing period context', () => {
    expect(
      patternReadiness({
        periodStarts: [],
        symptomPatterns: [],
        moodPhases: [],
        trackedDays: 0,
      })
    ).toMatchObject({ state: 'no-log' });

    expect(
      patternReadiness({
        periodStarts: [],
        symptomPatterns: [
          {
            ...emptyPattern,
            days: 2,
            rate: 2 / 3,
          },
        ],
        moodPhases: [],
        trackedDays: 3,
      })
    ).toMatchObject({ state: 'no-period', action: 'add-period' });
  });

  it('states the exact cycle, symptom and mood requirements without promising a pattern', () => {
    const readiness = patternReadiness({
      periodStarts: [],
      symptomPatterns: [],
      moodPhases: [],
      trackedDays: 3,
    });
    const detail = readiness.rows.map((row) => row.detail).join(' ');

    expect(detail).toContain('3 period starts');
    expect(detail).toContain('2 completed cycles');
    expect(detail).toContain('phase-linked days');
    expect(detail).toContain('at least 50%');
    expect(detail).toContain('2+ mood days');
    expect(detail).toContain('2 estimated phases');
    expect(detail).toContain('0.4+');
    expect(readiness.rows.map((row) => row.label)).toEqual([
      'Cycle',
      'Symptoms',
      'Mood',
    ]);
    expect(readiness.lead).not.toMatch(/few cycles/i);
    expect(readiness.lead).not.toMatch(/will appear/i);
  });

  it('reports too small a sample with the remaining count', () => {
    const readiness = patternReadiness({
      periodStarts: ['2026-11-01'],
      symptomPatterns: [emptyPattern],
      moodPhases: [],
      trackedDays: 4,
    });

    expect(readiness.state).toBe('insufficient');
    expect(readiness.startsRemaining).toBe(2);
    expect(readiness.rows[0].detail).toContain('2 more period starts');
    expect(readiness.action).toBe('open-calendar');
  });

  it('reports enough sample without a qualifying concentration or contrast', () => {
    const readiness = patternReadiness({
      periodStarts: ['2026-11-01'],
      symptomPatterns: [
        {
          ...phasedPattern,
          phaseDays: { menstrual: 1, follicular: 1, ovulation: 1, luteal: 0 },
          dominantShare: 1 / 3,
          dominantPhase: 'menstrual',
        },
      ],
      moodPhases: [
        { phase: 'follicular', days: 2, averageValence: 4, topTags: [] },
        { phase: 'luteal', days: 2, averageValence: 4, topTags: [] },
      ],
      trackedDays: 6,
    });

    expect(readiness.state).toBe('no-pattern');
    expect(readiness.hasComparableSample).toBe(true);
    expect(readiness.lead).toContain('nothing stands out yet');
    expect(readiness.lead).toContain('can stay as they are');
    expect(readiness.rows[1].detail).toContain('at least 50%');
    expect(readiness.rows[2].detail).toContain('0.4+');
  });
});
