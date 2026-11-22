/**
 * Pure math for the Insights "Mood & Cycle" section: grouping mood detail by
 * cycle phase and building the 60-day valence series for the trend chart.
 *
 * Phases come from the shared cycle model in `CycleModel.ts` — the same
 * ovulation/fertile-window dates the calendar forecast uses — so the Insights
 * phase buckets cannot drift from the calendar's ovulation dates.
 */

import type { PeriodRunContext } from './BleedingModel';
import type { CyclePhase } from './CycleModel';
import { buildCycleModel, PHASE_ORDER, phaseForDateInWindows } from './CycleModel';
import { MoodTag } from './MoodTags';
import { addDays, formatDateKey, parseDateKey } from './dateKey';

export type { CyclePhase } from './CycleModel';
export { PHASE_ORDER } from './CycleModel';

/** How many days the valence trend chart covers. */
export const MOOD_SERIES_DAYS = 60;

/** Rated days needed inside the trend window before the chart appears. */
export const MOOD_TREND_MIN_RATED_DAYS = 5;

export interface MoodDay {
  date: string;
  /** 0 = not set, otherwise 1-5. */
  valence: number;
  tags: MoodTag[];
  /** Legacy single mood id from old backups; no rating or tag strength. */
  legacyMood?: string;
}

export interface MoodSeriesPoint {
  date: string;
  /** 0 = no entry for that day. */
  valence: number;
  isPeriod: boolean;
}

export interface MoodTrendReadiness {
  /** Days with an overall rating inside the trend window. */
  ratedDays: number;
  /** Threshold for showing the trend. */
  minRatedDays: number;
  /** Ratings still needed inside the window. */
  remaining: number;
  ready: boolean;
}

/**
 * Trend eligibility uses overall ratings only. Feeling tags without a rating
 * stay useful in the recent list and phase summaries, but they do not advance
 * this count.
 */
export function summarizeMoodTrend(
  series: MoodSeriesPoint[],
  minRatedDays: number = MOOD_TREND_MIN_RATED_DAYS
): MoodTrendReadiness {
  const ratedDays = series.filter((point) => point.valence > 0).length;
  return {
    ratedDays,
    minRatedDays,
    remaining: Math.max(0, minRatedDays - ratedDays),
    ready: ratedDays >= minRatedDays,
  };
}

export interface PhaseTagSummary {
  id: string;
  /** Average strength across the days the tag was logged in this phase (1-3). */
  averageLevel: number;
  /** Days in this phase the tag was logged. */
  days: number;
}

export interface PhaseMoodSummary {
  phase: CyclePhase;
  /** Days with any mood data (valence or tags) in this phase. */
  days: number;
  /** Average of logged valences, null when the phase has none. */
  averageValence: number | null;
  /** Up to two most-logged feelings, tie-broken by strength and id. */
  topTags: PhaseTagSummary[];
}

/**
 * Cycle phase for a day. `periodStarts` and `ovulationDays` must be sorted
 * ascending (as the database queries return them). Returns null for days that
 * no recorded cycle covers (including days beyond the open cycle's expected end).
 *
 * Prefer building one model with `buildCycleModel` and reusing
 * `phaseForDateInWindows` when classifying many days.
 */
export function phaseForDate(
  date: string,
  periodStarts: string[],
  ovulationDays: string[] = [],
  periodContext: PeriodRunContext = {}
): CyclePhase | null {
  const model = buildCycleModel({
    periodStarts,
    ovulationDays,
    today: parseDateKey(date),
    ...periodContext,
  });
  return phaseForDateInWindows(date, model.windows);
}

export function summarizeMoodByPhase(
  days: MoodDay[],
  periodStarts: string[],
  ovulationDays: string[] = [],
  periodContext: PeriodRunContext = {}
): PhaseMoodSummary[] {
  const model = buildCycleModel({
    periodStarts,
    ovulationDays,
    today: new Date(),
    ...periodContext,
  });
  const accumulators = new Map<
    CyclePhase,
    {
      days: number;
      valenceSum: number;
      valenceDays: number;
      tags: Map<string, { levelSum: number; days: number }>;
    }
  >();

  for (const day of days) {
    const hasMood = day.valence > 0 || day.tags.length > 0;
    if (!hasMood) continue;

    const phase = phaseForDateInWindows(day.date, model.windows);
    if (!phase) continue;

    let acc = accumulators.get(phase);
    if (!acc) {
      acc = { days: 0, valenceSum: 0, valenceDays: 0, tags: new Map() };
      accumulators.set(phase, acc);
    }

    acc.days += 1;
    if (day.valence > 0) {
      acc.valenceSum += day.valence;
      acc.valenceDays += 1;
    }
    for (const tag of day.tags) {
      const entry = acc.tags.get(tag.id) ?? { levelSum: 0, days: 0 };
      entry.levelSum += tag.level;
      entry.days += 1;
      acc.tags.set(tag.id, entry);
    }
  }

  return PHASE_ORDER.filter((phase) => accumulators.has(phase)).map((phase) => {
    const acc = accumulators.get(phase)!;
    const topTags = [...acc.tags.entries()]
      .map(([id, entry]) => ({ id, averageLevel: entry.levelSum / entry.days, days: entry.days }))
      .sort(
        (a, b) =>
          b.days - a.days || b.averageLevel - a.averageLevel || a.id.localeCompare(b.id)
      )
      .slice(0, 2);

    return {
      phase,
      days: acc.days,
      averageValence: acc.valenceDays > 0 ? acc.valenceSum / acc.valenceDays : null,
      topTags,
    };
  });
}

/**
 * Compact recent-entry date. Older years keep the year so an all-history list
 * cannot be mistaken for the current year's entries.
 */
export function formatMoodEntryDate(
  dateKey: string,
  today: Date = new Date()
): string {
  const date = parseDateKey(dateKey);
  const includeYear = date.getFullYear() !== today.getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' as const } : {}),
  });
}

/**
 * The last `maxDays` calendar days (oldest → newest), filling days without a
 * database row with valence 0 so the x-axis stays calendar-true.
 */
export function buildMoodSeries(
  entriesByDate: Map<string, { valence: number; isPeriod: boolean }>,
  endDate: Date,
  maxDays: number = MOOD_SERIES_DAYS
): MoodSeriesPoint[] {
  const points: MoodSeriesPoint[] = [];
  for (let offset = maxDays - 1; offset >= 0; offset--) {
    const key = formatDateKey(addDays(endDate, -offset));
    const entry = entriesByDate.get(key);
    points.push({
      date: key,
      valence: entry?.valence ?? 0,
      isPeriod: entry?.isPeriod ?? false,
    });
  }
  return points;
}
