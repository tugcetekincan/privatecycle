/**
 * Pure math for the Insights "Mood & Cycle" section: grouping mood detail by
 * cycle phase and building the 60-day valence series for the trend chart.
 *
 * Phases come from the shared cycle model in `CycleModel.ts` — the same
 * ovulation/fertile-window dates the calendar forecast uses — so the Insights
 * phase buckets cannot drift from the calendar's ovulation dates.
 */

import type { CyclePhase } from './CycleModel';
import { buildCycleModel, PHASE_ORDER, phaseForDateInWindows } from './CycleModel';
import { MoodTag } from './MoodTags';
import { addDays, formatDateKey, parseDateKey } from './dateKey';

export type { CyclePhase } from './CycleModel';
export { PHASE_ORDER } from './CycleModel';

/** How many days the valence trend chart covers. */
export const MOOD_SERIES_DAYS = 60;

export interface MoodDay {
  date: string;
  /** 0 = not set, otherwise 1-5. */
  valence: number;
  tags: MoodTag[];
}

export interface MoodSeriesPoint {
  date: string;
  /** 0 = no entry for that day. */
  valence: number;
  isPeriod: boolean;
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
 * no recorded or predicted cycle covers.
 *
 * Prefer building one model with `buildCycleModel` and reusing
 * `phaseForDateInWindows` when classifying many days.
 */
export function phaseForDate(
  date: string,
  periodStarts: string[],
  ovulationDays: string[] = []
): CyclePhase | null {
  const model = buildCycleModel({ periodStarts, ovulationDays, today: parseDateKey(date) });
  return phaseForDateInWindows(date, model.windows);
}

export function summarizeMoodByPhase(
  days: MoodDay[],
  periodStarts: string[],
  ovulationDays: string[] = []
): PhaseMoodSummary[] {
  const model = buildCycleModel({ periodStarts, ovulationDays, today: new Date() });
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
