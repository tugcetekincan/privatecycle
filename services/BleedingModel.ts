/**
 * Bleeding-duration model: turns recorded `is_period` days into consecutive
 * bleeding runs, then learns a typical duration from recent completed runs.
 *
 * This is deliberately separate from the cycle model. A recorded period start
 * defines a cycle; a bleeding run describes how long the user bled. The two are
 * related but not interchangeable, and bleeding duration must never be treated
 * as evidence of ovulation.
 *
 * All dates are local-time `YYYY-MM-DD` day keys and compare chronologically as
 * strings.
 */

import { daysBetween, parseDateKey } from './dateKey';

/** Default bleeding span until two complete runs are recorded. */
export const STANDARD_PERIOD_LENGTH_DAYS = 5;

/** Predicted spans are clamped to this range so one entry cannot define them. */
export const PERIOD_LENGTH_MIN_DAYS = 2;
export const PERIOD_LENGTH_MAX_DAYS = 10;

/** Recent complete runs used for the typical duration. */
export const BLEEDING_HISTORY_LIMIT = 6;

/** Two complete runs are the minimum sample for a learned duration. */
const MIN_LEARNED_RUNS = 2;

export interface BleedingRun {
  /** First recorded period day. */
  start: string;
  /** Last recorded period day. */
  end: string;
  /** Number of consecutive recorded period days. */
  days: number;
  /** True when the run includes today; it is not a final length. */
  active: boolean;
}

export interface BleedingSummary {
  /** Every bleeding run, oldest first. */
  runs: BleedingRun[];
  /** Days by run start, used to classify recorded cycles. */
  runDaysByStart: Record<string, number>;
  /** Duration to use for predicted spans and predicted cycles. */
  predictionDays: number;
  /** Learned median, null until two complete runs exist. */
  typicalDays: number | null;
  /** Whether the duration comes from recorded runs or the standard fallback. */
  basis: 'recorded' | 'standard';
  /** Complete runs in the recent window, whether or not learning is possible. */
  sampleSize: number;
  /** Median before clamping; null until two complete runs exist. */
  rawMedianDays: number | null;
  /** True when the raw median was outside the supported 2–10 day range. */
  clamped: boolean;
  /** Most recent run, including an active one. */
  lastPeriod: BleedingRun | null;
}

/** Input accepted by the shared cycle/phase helpers. */
export interface PeriodRunContext {
  periodRunDays?: Record<string, number>;
  periodLengthDays?: number;
  activePeriodStart?: string;
}

export interface BleedingSummaryOptions {
  /** Complete runs considered, most recent last. Default 6. */
  limit?: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const median = (values: number[]): number => {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
};

/**
 * Group recorded period days into consecutive runs. Input order does not
 * matter; duplicate and non-consecutive days are handled defensively. A run
 * that contains today is marked active and excluded from learning.
 */
export const buildBleedingRuns = (
  periodDays: string[],
  todayKey: string
): BleedingRun[] => {
  const sorted = [...new Set(periodDays)]
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
    .sort();

  const runs: BleedingRun[] = [];
  for (const day of sorted) {
    const previous = runs[runs.length - 1];
    if (
      previous &&
      daysBetween(parseDateKey(previous.end), parseDateKey(day)) === 1
    ) {
      previous.end = day;
      previous.days += 1;
    } else {
      runs.push({ start: day, end: day, days: 1, active: false });
    }
  }

  for (const run of runs) {
    run.active = run.start <= todayKey && run.end >= todayKey;
  }

  return runs;
};

/**
 * Summarize bleeding runs. The typical duration is the median of the last six
 * complete runs, rounded and clamped to 2–10 days. Fewer than two complete
 * runs keep the standard 5-day fallback, so the UI can label it honestly.
 */
export const summarizeBleedingRuns = (
  runs: BleedingRun[],
  options: BleedingSummaryOptions = {}
): BleedingSummary => {
  const limit = Math.max(1, Math.floor(options.limit ?? BLEEDING_HISTORY_LIMIT));
  const complete = runs.filter((run) => !run.active);
  const recent = complete.slice(-limit);
  const sortedDays = recent.map((run) => run.days).sort((a, b) => a - b);
  const canLearn = recent.length >= MIN_LEARNED_RUNS;
  const rawMedianDays = canLearn ? median(sortedDays) : null;
  const typicalDays =
    rawMedianDays === null
      ? null
      : clamp(
          Math.round(rawMedianDays),
          PERIOD_LENGTH_MIN_DAYS,
          PERIOD_LENGTH_MAX_DAYS
        );
  const predictionDays = typicalDays ?? STANDARD_PERIOD_LENGTH_DAYS;
  const runDaysByStart: Record<string, number> = {};
  for (const run of runs) runDaysByStart[run.start] = run.days;

  return {
    runs,
    runDaysByStart,
    predictionDays,
    typicalDays,
    basis: typicalDays === null ? 'standard' : 'recorded',
    sampleSize: recent.length,
    rawMedianDays,
    clamped:
      typicalDays !== null &&
      (rawMedianDays! < PERIOD_LENGTH_MIN_DAYS ||
        rawMedianDays! > PERIOD_LENGTH_MAX_DAYS),
    lastPeriod: runs.length > 0 ? runs[runs.length - 1] : null,
  };
};

/** Convenience wrapper for the raw `is_period` day list. */
export const summarizePeriodDays = (
  periodDays: string[],
  todayKey: string,
  options: BleedingSummaryOptions = {}
): BleedingSummary =>
  summarizeBleedingRuns(buildBleedingRuns(periodDays, todayKey), options);

/** Empty summary for a database with no period rows. */
export const emptyBleedingSummary = (): BleedingSummary => ({
  runs: [],
  runDaysByStart: {},
  predictionDays: STANDARD_PERIOD_LENGTH_DAYS,
  typicalDays: null,
  basis: 'standard',
  sampleSize: 0,
  rawMedianDays: null,
  clamped: false,
  lastPeriod: null,
});

/** Flatten a summary into the context `buildCycleModel` consumes. */
export const toPeriodRunContext = (
  summary: BleedingSummary
): PeriodRunContext => ({
  periodRunDays: summary.runDaysByStart,
  periodLengthDays: summary.predictionDays,
  activePeriodStart: summary.lastPeriod?.active
    ? summary.lastPeriod.start
    : undefined,
});
