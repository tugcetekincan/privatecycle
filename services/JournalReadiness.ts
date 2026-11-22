/**
 * User-facing thresholds and copy for the read-only Overview and Insights tabs.
 * The evaluators (CycleNarrative, MoodInsights, BleedingModel) remain the
 * source of truth for eligibility; the boundary tests pin this copy to them so
 * a "needs more data" panel cannot promise a pattern after an arbitrary count.
 *
 * Pure: no SQLite/Expo imports, so the thresholds are directly unit-testable.
 */

import type { BleedingSummary } from './BleedingModel';
import {
  MOOD_SERIES_DAYS,
  MOOD_TREND_MIN_RATED_DAYS,
  MoodTrendReadiness,
  PhaseMoodSummary,
  summarizeMoodTrend,
  MoodSeriesPoint,
  MoodDay,
} from './MoodInsights';
import type { SymptomPattern } from './SymptomInsights';

/** Two separate starts make one completed cycle and one measured length. */
export const CYCLE_AVERAGE_MIN_STARTS = 2;
/** Three separate starts make two completed cycles and a variation range. */
export const CYCLE_VARIATION_MIN_STARTS = 3;
/** Two complete bleeding runs are needed for a recorded typical period. */
export const TYPICAL_PERIOD_MIN_RUNS = 2;

export interface CycleMetricHints {
  /** Small contextual note beside an unknown average, or null when known. */
  average: string | null;
  /** Small contextual note beside an unknown typical period, or null. */
  typicalPeriod: string | null;
  /** Small contextual note beside an unknown variation, or null. */
  variation: string | null;
}

const plural = (count: number, singular: string, pluralForm: string): string =>
  count === 1 ? singular : pluralForm;

/**
 * Contextual hints for the three cycle statistics. Values stay unknown until
 * their real sample exists; these strings say exactly what is missing.
 */
export function cycleMetricHints(
  periodStarts: number,
  periodLength: Pick<BleedingSummary, 'typicalDays' | 'sampleSize'>
): CycleMetricHints {
  const starts = Math.max(0, periodStarts);
  const averageMissing = Math.max(0, CYCLE_AVERAGE_MIN_STARTS - starts);
  const variationMissing = Math.max(0, CYCLE_VARIATION_MIN_STARTS - starts);

  let average: string | null = null;
  if (averageMissing > 0) {
    average = `${averageMissing} more ${plural(
      averageMissing,
      'period start',
      'period starts'
    )}`;
  }

  let variation: string | null = null;
  if (variationMissing > 0) {
    variation = `${variationMissing} more ${plural(
      variationMissing,
      'period start',
      'period starts'
    )}`;
  }

  let typicalPeriod: string | null = null;
  if (periodLength.typicalDays === null) {
    if (periodLength.sampleSize === 0) {
      typicalPeriod = `Needs ${TYPICAL_PERIOD_MIN_RUNS} completed periods`;
    } else {
      const runsMissing = Math.max(0, TYPICAL_PERIOD_MIN_RUNS - periodLength.sampleSize);
      typicalPeriod = `Needs ${runsMissing} more completed ${plural(
        runsMissing,
        'period',
        'periods'
      )}`;
    }
  }

  return { average, typicalPeriod, variation };
}

export interface MoodSectionInput {
  moodSeries: MoodSeriesPoint[];
  moodPhases: PhaseMoodSummary[];
  recentMoods: MoodDay[];
}

export interface MoodSectionState {
  hasEntries: boolean;
  hasPhaseContext: boolean;
  trend: MoodTrendReadiness;
  /** Card meta that describes the content actually shown. */
  label:
    | 'Trend + phases'
    | 'Trend'
    | 'Phase averages'
    | 'Feelings by phase'
    | 'Recent entries'
    | 'No entries';
  /** Exact progress toward the trend threshold, or null when the trend is shown. */
  trendCopy: string | null;
  /** True when recent entries exist but no phase summary can be built. */
  needsPhaseContext: boolean;
}

/**
 * Resolve what the Mood card can truthfully show. Feeling tags count as mood
 * entries and appear in the recent list, but only overall ratings advance the
 * trend threshold.
 */
export function moodSectionState(input: MoodSectionInput): MoodSectionState {
  const trend = summarizeMoodTrend(input.moodSeries);
  const hasEntries = input.recentMoods.length > 0;
  const hasPhaseContext = input.moodPhases.length > 0;
  const hasRatedPhaseAverage = input.moodPhases.some(
    (entry) => entry.averageValence !== null
  );

  const label: MoodSectionState['label'] = trend.ready
    ? hasPhaseContext
      ? 'Trend + phases'
      : 'Trend'
    : hasPhaseContext
      ? hasRatedPhaseAverage
        ? 'Phase averages'
        : 'Feelings by phase'
      : hasEntries
        ? 'Recent entries'
        : 'No entries';

  const trendCopy =
    !trend.ready && hasEntries
      ? `${trend.ratedDays} of ${MOOD_TREND_MIN_RATED_DAYS} rated days in the last ${MOOD_SERIES_DAYS} days · ${trend.remaining} more for a trend`
      : null;

  return {
    hasEntries,
    hasPhaseContext,
    trend,
    label,
    trendCopy,
    needsPhaseContext: hasEntries && !hasPhaseContext,
  };
}

export type PatternReadinessState =
  | 'no-log'
  | 'no-period'
  | 'insufficient'
  | 'no-pattern';

export interface PatternReadinessInput {
  periodStarts: string[];
  symptomPatterns: SymptomPattern[];
  moodPhases: PhaseMoodSummary[];
  trackedDays: number;
}

export interface PatternRequirementRow {
  label: 'Cycle' | 'Symptoms' | 'Mood';
  detail: string;
}

export interface PatternReadiness {
  state: PatternReadinessState;
  title: string;
  lead: string;
  rows: PatternRequirementRow[];
  /** Starts still needed for cycle comparison. */
  startsRemaining: number;
  /** Whether at least one comparison already has enough entries to compare. */
  hasComparableSample: boolean;
  /** The single most useful Calendar handoff for this state. */
  action: 'add-period' | 'open-calendar';
}

const MOOD_REQUIREMENT =
  '2+ mood days in each of 2 estimated phases; rated averages differ by 0.4+';
const SYMPTOM_REQUIREMENT =
  '3+ phase-linked days, with at least 50% in one estimated phase';

/**
 * Explain why the pattern cards are empty. The state distinguishes missing
 * period context, a missing log, too small a sample, and enough sample without
 * a qualifying concentration/contrast. None of these promise that a pattern
 * will appear after a fixed amount of logging.
 */
export function patternReadiness(
  input: PatternReadinessInput
): PatternReadiness {
  const starts = input.periodStarts.length;
  const startsRemaining = Math.max(0, CYCLE_VARIATION_MIN_STARTS - starts);
  const hasCycleSample = starts >= CYCLE_VARIATION_MIN_STARTS;
  const hasSymptomSample = input.symptomPatterns.some(
    (pattern) => pattern.phasedDays >= 3
  );
  const ratedMoodPhases = input.moodPhases.filter(
    (entry) => entry.days >= 2 && entry.averageValence !== null
  );
  const hasMoodSample = ratedMoodPhases.length >= 2;
  const hasComparableSample = hasCycleSample || hasSymptomSample || hasMoodSample;

  const rows: PatternRequirementRow[] = [
    {
      label: 'Cycle',
      detail:
        starts === 0
          ? '3 period starts (2 completed cycles)'
          : starts < CYCLE_VARIATION_MIN_STARTS
            ? `${startsRemaining} more period ${plural(
                startsRemaining,
                'start',
                'starts'
              )} (3 total)`
            : '3 period starts logged',
    },
    { label: 'Symptoms', detail: SYMPTOM_REQUIREMENT },
    { label: 'Mood', detail: MOOD_REQUIREMENT },
  ];

  let state: PatternReadinessState;
  let title: string;
  let lead: string;
  if (input.trackedDays === 0) {
    state = 'no-log';
    title = 'Comparisons need a little history';
    lead = 'Log a symptom or feeling to start. These comparisons appear as your history grows.';
  } else if (starts === 0) {
    state = 'no-period';
    title = 'Comparisons need phase context';
    lead =
      'Add a period start when you can so future entries can be compared across estimated phases.';
  } else if (hasComparableSample) {
    state = 'no-pattern';
    title = 'No clear comparison yet';
    lead =
      'Some comparisons have enough entries, but nothing stands out yet. Your entries can stay as they are.';
  } else {
    state = 'insufficient';
    title = 'Comparisons need more history';
    lead = 'Your log is growing. Each comparison needs a little more context.';
  }

  return {
    state,
    title,
    lead,
    rows,
    startsRemaining,
    hasComparableSample,
    action: starts === 0 ? 'add-period' : 'open-calendar',
  };
}
