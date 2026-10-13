import { addDays, daysBetween, formatDateKey, parseDateKey } from './dateKey';

/**
 * Pure fertility forecast math.
 *
 * Predicts ovulation and the fertile window from recorded period starts and
 * recorded ovulation days. The most accurate anchor is the luteal phase: the
 * gap from ovulation to the next period is far more stable per person than
 * the follicular phase, so forecasts are "next period minus personal luteal
 * length" once one full cycle has been recorded, and standard 14 days before
 * that. Kept free of SQLite/Expo imports so it is unit-testable and shared by
 * DataService and the screens.
 */

export interface FertilityStats {
  /** Observed mean cycle length in days (28 when unknowable). */
  averageCycleLength: number;
  /** Observed mean luteal phase in days, null until one full cycle is recorded. */
  averageLutealLength: number | null;
  /** Where the ovulation estimate comes from. */
  basis: 'recorded' | 'standard';
}

export interface CycleForecast {
  /** Predicted start of the period that ends this cycle. */
  periodStart: string;
  /** Predicted ovulation day (next period start minus the luteal length). */
  ovulationDate: string;
  /** Fertile window: the five days before ovulation through ovulation itself. */
  windowStart: string;
  windowEnd: string;
  /** True for the cycle the user is currently in (the next predicted period ends it). */
  isCurrentCycle: boolean;
}

export interface FertilityForecast {
  /** Recorded ovulation days, ascending. */
  ovulationDays: string[];
  /** Predicted future period starts, ascending (same horizon as the calendar). */
  futurePeriodStarts: string[];
  /** Forecasts whose fertile window has not fully passed, ascending. */
  cycles: CycleForecast[];
  stats: FertilityStats;
  /** Recorded ovulation day inside the current open cycle, if any. */
  currentCycleOvulation: string | null;
}

export interface FertilityForecastInput {
  /** Observed period start days, ascending. */
  periodStarts: string[];
  /** Recorded ovulation days, ascending. */
  ovulationDays: string[];
  /** Reference "today" (local time). */
  today: Date;
}

const PREDICTED_CYCLES = 6;
const DEFAULT_CYCLE_LENGTH = 28;
const DEFAULT_LUTEAL_LENGTH = 14;
/** Fertile window convention: five days before ovulation + ovulation day. */
const FERTILE_WINDOW_DAYS_BEFORE = 5;
/** Luteal phases outside this range are treated as mis-entries, not data. */
const LUTEAL_MIN_DAYS = 8;
const LUTEAL_MAX_DAYS = 17;

const mean = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const cycleLengths = (periodStarts: string[]): number[] => {
  const lengths: number[] = [];
  for (let i = 1; i < periodStarts.length; i++) {
    lengths.push(daysBetween(parseDateKey(periodStarts[i - 1]), parseDateKey(periodStarts[i])));
  }
  return lengths;
};

/** Mean cycle length from consecutive period starts; 28 when unknowable. */
export const averageCycleLength = (periodStarts: string[]): number => {
  if (periodStarts.length < 2) return DEFAULT_CYCLE_LENGTH;
  return mean(cycleLengths(periodStarts));
};

/** Standard deviation of cycle lengths; small-sample default mirrors the calendar. */
const cycleVariability = (periodStarts: string[]): number => {
  if (periodStarts.length < 3) return 2;
  const lengths = cycleLengths(periodStarts);
  const avg = mean(lengths);
  return Math.sqrt(mean(lengths.map((length) => (length - avg) ** 2)));
};

/**
 * Future period starts. Keeps the calendar's historical shape: exact average
 * spacing for the first prediction, deterministic small jitter afterwards so
 * projected dates don't look artificially regular.
 */
export const predictPeriodStarts = (
  periodStarts: string[],
  count: number = PREDICTED_CYCLES
): string[] => {
  if (periodStarts.length === 0) return [];

  const last = parseDateKey(periodStarts[periodStarts.length - 1]);
  const average = Math.round(averageCycleLength(periodStarts));
  const variability = cycleVariability(periodStarts);
  const hasObservedCycles = periodStarts.length >= 2;

  const predictions: string[] = [];
  for (let i = 1; i <= count; i++) {
    let adjustment = 0;
    if (hasObservedCycles && i > 1) {
      const seed = last.getTime() + i;
      const pseudoRandom = (Math.sin(seed) + 1) / 2;
      adjustment = Math.round((pseudoRandom - 0.5) * variability * 0.5);
    }
    predictions.push(formatDateKey(addDays(last, average * i + adjustment)));
  }
  return predictions;
};

/** Latest recorded ovulation day strictly inside `(after, before)`. */
const latestOvulationBetween = (
  ovulationDays: string[],
  after: string,
  before: string
): string | null => {
  let latest: string | null = null;
  for (const day of ovulationDays) {
    // ISO day keys compare chronologically as strings.
    if (day > after && day < before) latest = day;
  }
  return latest;
};

/** Observed luteal lengths (ovulation -> next period), plausible values only. */
const observedLutealLengths = (periodStarts: string[], ovulationDays: string[]): number[] => {
  const lengths: number[] = [];
  for (let i = 1; i < periodStarts.length; i++) {
    const ovulation = latestOvulationBetween(ovulationDays, periodStarts[i - 1], periodStarts[i]);
    if (!ovulation) continue;
    const luteal = daysBetween(parseDateKey(ovulation), parseDateKey(periodStarts[i]));
    if (luteal >= LUTEAL_MIN_DAYS && luteal <= LUTEAL_MAX_DAYS) lengths.push(luteal);
  }
  return lengths;
};

/** Latest recorded ovulation day in the current open cycle, up to today. */
const findCurrentCycleOvulation = (
  periodStarts: string[],
  ovulationDays: string[],
  todayKey: string
): string | null => {
  if (periodStarts.length === 0) return null;
  const lastStart = periodStarts[periodStarts.length - 1];
  let latest: string | null = null;
  for (const day of ovulationDays) {
    if (day > lastStart && day <= todayKey) latest = day;
  }
  return latest;
};

export const computeFertilityForecast = (input: FertilityForecastInput): FertilityForecast => {
  const { periodStarts, ovulationDays } = input;
  const todayKey = formatDateKey(input.today);

  const futurePeriodStarts = predictPeriodStarts(periodStarts);

  const lutealLengths = observedLutealLengths(periodStarts, ovulationDays);
  const averageLuteal = lutealLengths.length > 0 ? mean(lutealLengths) : null;
  const effectiveLuteal = Math.round(averageLuteal ?? DEFAULT_LUTEAL_LENGTH);

  const currentCycleOvulation = findCurrentCycleOvulation(periodStarts, ovulationDays, todayKey);

  const cycles: CycleForecast[] = [];
  futurePeriodStarts.forEach((periodStart, index) => {
    const isCurrentCycle = index === 0;
    // A recorded ovulation day is history; it beats the prediction for that cycle.
    if (isCurrentCycle && currentCycleOvulation) return;

    const ovulationDate = formatDateKey(addDays(parseDateKey(periodStart), -effectiveLuteal));
    // Once the window has fully passed, it is no longer a forecast.
    if (ovulationDate < todayKey) return;

    cycles.push({
      periodStart,
      ovulationDate,
      windowStart: formatDateKey(addDays(parseDateKey(ovulationDate), -FERTILE_WINDOW_DAYS_BEFORE)),
      windowEnd: ovulationDate,
      isCurrentCycle,
    });
  });

  return {
    ovulationDays,
    futurePeriodStarts,
    cycles,
    stats: {
      averageCycleLength: averageCycleLength(periodStarts),
      averageLutealLength: averageLuteal,
      basis: averageLuteal !== null ? 'recorded' : 'standard',
    },
    currentCycleOvulation,
  };
};
