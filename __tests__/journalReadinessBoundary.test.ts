import { buildNarrative } from '@/services/CycleNarrative';
import {
  cycleMetricHints,
  patternReadiness,
} from '@/services/JournalReadiness';
import { PhaseMoodSummary } from '@/services/MoodInsights';
import { summarizePeriodDays } from '@/services/BleedingModel';
import { SymptomPattern } from '@/services/SymptomInsights';

/**
 * These boundaries keep the readiness copy honest against the services that
 * actually qualify a card. If a threshold changes in one place, one of these
 * pairs should fail.
 */

const weakSymptom: SymptomPattern = {
  id: 'headache',
  days: 3,
  rate: 1,
  phaseDays: { menstrual: 1, follicular: 1, ovulation: 1, luteal: 0 },
  phaseShares: { menstrual: 1 / 3, follicular: 1 / 3, ovulation: 1 / 3, luteal: 0 },
  phasedDays: 3,
  dominantPhase: 'menstrual',
  dominantShare: 1 / 3,
};

describe('JournalReadiness ↔ narrative eligibility', () => {
  it('matches a symptom sample that has no dominant phase', () => {
    const narrative = buildNarrative({
      symptomPatterns: [weakSymptom],
      moodPhases: [],
      periodStarts: ['2026-11-01'],
    });
    expect(narrative.patterns).toEqual([]);

    const readiness = patternReadiness({
      periodStarts: ['2026-11-01'],
      symptomPatterns: [weakSymptom],
      moodPhases: [],
      trackedDays: 3,
    });
    expect(readiness.state).toBe('no-pattern');
    expect(readiness.rows[1].detail).toContain('at least 50%');
  });

  it('matches the mood 2-day and 0.4 contrast thresholds', () => {
    const equalPhases: PhaseMoodSummary[] = [
      { phase: 'follicular', days: 2, averageValence: 4, topTags: [] },
      { phase: 'luteal', days: 2, averageValence: 4, topTags: [] },
    ];
    const equalNarrative = buildNarrative({
      symptomPatterns: [],
      moodPhases: equalPhases,
      periodStarts: ['2026-11-01'],
    });
    expect(equalNarrative.patterns).toEqual([]);

    const equalReadiness = patternReadiness({
      periodStarts: ['2026-11-01'],
      symptomPatterns: [],
      moodPhases: equalPhases,
      trackedDays: 4,
    });
    expect(equalReadiness.state).toBe('no-pattern');
    expect(equalReadiness.rows[2].detail).toContain('0.4+');

    const contrastingPhases = equalPhases.map((entry, index) => ({
      ...entry,
      averageValence: index === 0 ? 4.5 : 4.0,
    }));
    const contrastingNarrative = buildNarrative({
      symptomPatterns: [],
      moodPhases: contrastingPhases,
      periodStarts: ['2026-11-01'],
    });
    expect(contrastingNarrative.patterns.map((pattern) => pattern.id)).toEqual([
      'mood',
    ]);
  });

  it('matches the three-start cycle comparison boundary', () => {
    const twoStarts = buildNarrative({
      symptomPatterns: [],
      moodPhases: [],
      periodStarts: ['2026-01-01', '2026-01-29'],
    });
    expect(twoStarts.patterns).toEqual([]);
    const before = patternReadiness({
      periodStarts: ['2026-01-01', '2026-01-29'],
      symptomPatterns: [],
      moodPhases: [],
      trackedDays: 2,
    });
    expect(before.state).toBe('insufficient');
    expect(before.rows[0].detail).toBe('1 more period start (3 total)');

    const threeStarts = buildNarrative({
      symptomPatterns: [],
      moodPhases: [],
      periodStarts: ['2026-01-01', '2026-01-29', '2026-02-26'],
    });
    expect(threeStarts.patterns.map((pattern) => pattern.id)).toEqual(['cycle']);
    const ready = patternReadiness({
      periodStarts: ['2026-01-01', '2026-01-29', '2026-02-26'],
      symptomPatterns: [],
      moodPhases: [],
      trackedDays: 3,
    });
    expect(ready.rows[0].detail).toBe('3 period starts logged');
  });

  it('matches the two-complete-runs threshold for a typical period', () => {
    const oneRun = summarizePeriodDays(
      ['2026-01-01', '2026-01-02', '2026-01-03'],
      '2026-03-01'
    );
    expect(oneRun.sampleSize).toBe(1);
    expect(oneRun.typicalDays).toBeNull();
    expect(
      cycleMetricHints(1, oneRun).typicalPeriod
    ).toBe('Needs 1 more completed period');

    const twoRuns = summarizePeriodDays(
      [
        '2026-01-01',
        '2026-01-02',
        '2026-01-03',
        '2026-02-01',
        '2026-02-02',
        '2026-02-03',
      ],
      '2026-03-01'
    );
    expect(twoRuns.sampleSize).toBe(2);
    expect(twoRuns.typicalDays).not.toBeNull();
    expect(cycleMetricHints(1, twoRuns).typicalPeriod).toBeNull();
  });
});
