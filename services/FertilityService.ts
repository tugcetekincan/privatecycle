import { averageCycleLength, buildCycleModel } from './CycleModel';
import { formatDateKey } from './dateKey';

export { averageCycleLength, predictPeriodStarts } from './CycleModel';

/**
 * Pure fertility forecast math.
 *
 * Predicts ovulation and the fertile window from recorded period starts and
 * recorded ovulation days. The cycle model lives in `CycleModel.ts` so the
 * Insights phase grouping uses exactly the same ovulation dates. The most
 * accurate anchor is the luteal phase: the gap from ovulation to the next
 * period is far more stable per person than the follicular phase, so forecasts
 * are "next period minus personal luteal length" once one full cycle has been
 * recorded, and standard 14 days before that.
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

export const computeFertilityForecast = (input: FertilityForecastInput): FertilityForecast => {
  const { periodStarts, ovulationDays } = input;
  const todayKey = formatDateKey(input.today);
  const model = buildCycleModel(input);
  const windowByEnd = new Map(model.windows.map((window) => [window.end, window]));

  const cycles: CycleForecast[] = [];
  model.futurePeriodStarts.forEach((periodStart, index) => {
    const isCurrentCycle = index === 0;
    // A recorded ovulation day is history; it beats the prediction for that cycle.
    if (isCurrentCycle && model.currentCycleOvulation) return;

    const window = windowByEnd.get(periodStart);
    if (!window) return;
    // Once the window has fully passed, it is no longer a forecast.
    if (window.ovulationDate < todayKey) return;

    cycles.push({
      periodStart,
      ovulationDate: window.ovulationDate,
      windowStart: window.fertileWindowStart,
      windowEnd: window.ovulationDate,
      isCurrentCycle,
    });
  });

  return {
    ovulationDays,
    futurePeriodStarts: model.futurePeriodStarts,
    cycles,
    stats: {
      averageCycleLength: averageCycleLength(periodStarts),
      averageLutealLength: model.averageLutealLength,
      basis: model.averageLutealLength !== null ? 'recorded' : 'standard',
    },
    currentCycleOvulation: model.currentCycleOvulation,
  };
};
