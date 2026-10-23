import { addDays, daysBetween, formatDateKey, parseDateKey } from './dateKey';

/**
 * Shared cycle model: period starts -> cycle windows -> predicted periods,
 * ovulation days, fertile windows and phase windows.
 *
 * This is the single source of truth for both the calendar forecast
 * (`FertilityService.computeFertilityForecast`) and the Insights phase
 * grouping (`MoodInsights`). Ovulation is anchored on the luteal phase: the
 * next period start minus the personal average gap from a recorded ovulation
 * to the following period, or 14 days until one full cycle is recorded. A
 * recorded ovulation up to today always beats the prediction for its cycle.
 * Future-dated ovulation marks are ignored until their day arrives.
 *
 * All dates are local-time `YYYY-MM-DD` day keys and compare chronologically
 * as strings.
 */

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

export const PHASE_ORDER: CyclePhase[] = ['menstrual', 'follicular', 'ovulation', 'luteal'];

export interface CycleWindow {
  /** Recorded period start that opens the cycle. */
  start: string;
  /** Start of the next period; the cycle spans `[start, end)`. */
  end: string;
  /** True when `end` is a predicted start rather than a recorded one. */
  predictedEnd: boolean;
  /** True for the window that contains today (or the last one when overdue). */
  isCurrent: boolean;
  /** Recorded ovulation when present, otherwise `end - effectiveLutealLength`. */
  ovulationDate: string;
  /** True when `ovulationDate` comes from a recorded ovulation day. */
  ovulationRecorded: boolean;
  /** Five days before ovulation through ovulation itself. */
  fertileWindowStart: string;
  fertileWindowEnd: string;
  /** Phase window: the ovulation day through two days after it. */
  ovulationPhaseStart: string;
  ovulationPhaseEnd: string;
}

export interface CycleModelInput {
  /** Recorded period start days, ascending. */
  periodStarts: string[];
  /** Recorded ovulation days, ascending. */
  ovulationDays: string[];
  /** Reference "today" (local time). */
  today: Date;
}

export interface CycleModel {
  /** Recorded cycles plus the predicted cycles needed for phase lookups. */
  windows: CycleWindow[];
  /** First six predicted period starts (the calendar horizon). */
  futurePeriodStarts: string[];
  /** Observed mean luteal phase in days, null until one full cycle is recorded. */
  averageLutealLength: number | null;
  /** Rounded luteal length used for predictions (14 until one is recorded). */
  effectiveLutealLength: number;
  /** Latest recorded ovulation in the open cycle, up to today. */
  currentCycleOvulation: string | null;
}

const PREDICTED_CYCLES = 6;
const DEFAULT_CYCLE_LENGTH = 28;
const DEFAULT_LUTEAL_LENGTH = 14;
/** Fertile window convention: five days before ovulation + ovulation day. */
const FERTILE_WINDOW_DAYS_BEFORE = 5;
/** Luteal phases outside this range are treated as mis-entries, not data. */
const LUTEAL_MIN_DAYS = 8;
const LUTEAL_MAX_DAYS = 17;
/** Menstrual phase: the first six days (day 0 through day 5). */
const MENSTRUAL_PHASE_DAYS = 6;
/** Ovulation phase length, starting on the ovulation day. */
const OVULATION_PHASE_DAYS = 3;

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

const lutealStats = (
  periodStarts: string[],
  ovulationDays: string[]
): { average: number | null; effective: number } => {
  const lengths = observedLutealLengths(periodStarts, ovulationDays);
  const average = lengths.length > 0 ? mean(lengths) : null;
  return { average, effective: Math.round(average ?? DEFAULT_LUTEAL_LENGTH) };
};

/**
 * Phase bounds for a cycle. The ovulation phase keeps the legacy three-day
 * shape (ovulation day through two days after), clamped so it always starts
 * after the menstrual phase and ends before the next period.
 */
const ovulationPhaseBounds = (
  start: string,
  end: string,
  ovulationDate: string
): { ovulationPhaseStart: string; ovulationPhaseEnd: string } => {
  const earliest = formatDateKey(addDays(parseDateKey(start), MENSTRUAL_PHASE_DAYS));
  const latest = formatDateKey(addDays(parseDateKey(end), -1));
  const startKey = ovulationDate < earliest ? earliest : ovulationDate;
  const endRaw = formatDateKey(addDays(parseDateKey(ovulationDate), OVULATION_PHASE_DAYS - 1));
  const endKey = endRaw > latest ? latest : endRaw;

  // Defensive: a very short cycle can leave the clamped start after the end.
  if (startKey > endKey) {
    const pinned = ovulationDate < earliest ? earliest : latest;
    return { ovulationPhaseStart: pinned, ovulationPhaseEnd: pinned };
  }
  return { ovulationPhaseStart: startKey, ovulationPhaseEnd: endKey };
};

const buildWindow = (
  start: string,
  end: string,
  predictedEnd: boolean,
  historicalOvulations: string[],
  effectiveLuteal: number
): CycleWindow => {
  const recorded = latestOvulationBetween(historicalOvulations, start, end);
  const ovulationDate =
    recorded ?? formatDateKey(addDays(parseDateKey(end), -effectiveLuteal));
  const { ovulationPhaseStart, ovulationPhaseEnd } = ovulationPhaseBounds(
    start,
    end,
    ovulationDate
  );

  return {
    start,
    end,
    predictedEnd,
    isCurrent: false,
    ovulationDate,
    ovulationRecorded: recorded !== null,
    fertileWindowStart: formatDateKey(
      addDays(parseDateKey(ovulationDate), -FERTILE_WINDOW_DAYS_BEFORE)
    ),
    fertileWindowEnd: ovulationDate,
    ovulationPhaseStart,
    ovulationPhaseEnd,
  };
};

/**
 * Build the cycle windows used by both the forecast and the phase helpers.
 *
 * Windows exist for every recorded period start (the last one ends at the
 * first predicted start) and for the six predicted cycles after it, so phase
 * lookups keep working when the next period is overdue. Future-dated ovulation
 * marks are ignored until their day arrives.
 */
export const buildCycleModel = (input: CycleModelInput): CycleModel => {
  const { periodStarts, ovulationDays, today } = input;
  const todayKey = formatDateKey(today);
  const { average, effective } = lutealStats(periodStarts, ovulationDays);

  if (periodStarts.length === 0) {
    return {
      windows: [],
      futurePeriodStarts: [],
      averageLutealLength: average,
      effectiveLutealLength: effective,
      currentCycleOvulation: null,
    };
  }

  const futurePeriodStarts = predictPeriodStarts(periodStarts);
  // One extra start closes the last predicted window.
  const boundaries = predictPeriodStarts(periodStarts, PREDICTED_CYCLES + 1);
  // Future records are not history yet and must not move the current phase.
  const historicalOvulations = ovulationDays.filter((day) => day <= todayKey);

  const windows: CycleWindow[] = [];

  for (let index = 0; index < periodStarts.length; index++) {
    const start = periodStarts[index];
    const nextRecorded = periodStarts[index + 1];
    const end = nextRecorded ?? boundaries[0];
    windows.push(buildWindow(start, end, nextRecorded === undefined, historicalOvulations, effective));
  }

  for (let index = 0; index < PREDICTED_CYCLES; index++) {
    windows.push(
      buildWindow(boundaries[index], boundaries[index + 1], true, historicalOvulations, effective)
    );
  }

  // The window containing today is current. When overdue past the last
  // prediction, keep the last window current instead of dropping phases.
  const current =
    windows.find((window) => todayKey >= window.start && todayKey < window.end) ??
    (todayKey < windows[0].start ? windows[0] : windows[windows.length - 1]);
  current.isCurrent = true;

  const openWindow = windows[periodStarts.length - 1];

  return {
    windows,
    futurePeriodStarts,
    averageLutealLength: average,
    effectiveLutealLength: effective,
    currentCycleOvulation: openWindow.ovulationRecorded ? openWindow.ovulationDate : null,
  };
};

/** Phase for a day, given the cycle windows that cover it. */
export const phaseForDateInWindows = (
  date: string,
  windows: CycleWindow[]
): CyclePhase | null => {
  const window = windows.find((candidate) => date >= candidate.start && date < candidate.end);
  if (!window) return null;

  const menstrualEnd = formatDateKey(
    addDays(parseDateKey(window.start), MENSTRUAL_PHASE_DAYS - 1)
  );
  if (date <= menstrualEnd) return 'menstrual';
  if (date < window.ovulationPhaseStart) return 'follicular';
  if (date <= window.ovulationPhaseEnd) return 'ovulation';
  return 'luteal';
};
