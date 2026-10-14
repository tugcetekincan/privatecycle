/**
 * Pure math for the Insights "Mood & Cycle" section: grouping mood detail by
 * cycle phase and building the 60-day valence series for the trend chart.
 *
 * Phase thresholds intentionally mirror `AnalyticsService.getCyclePhase`
 * (menstrual ≤ 5 days since the last period start, follicular ≤ 13,
 * ovulation ≤ 16, luteal beyond) — keep the two consistent.
 */

import { MoodTag } from './MoodTags';
import { addDays, daysBetween, formatDateKey, parseDateKey } from './dateKey';

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

export const PHASE_ORDER: CyclePhase[] = ['menstrual', 'follicular', 'ovulation', 'luteal'];

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
 * Cycle phase for a day. `periodStarts` must be sorted ascending (as the
 * period-start queries return them). Returns null for days before every
 * recorded period start.
 */
export function phaseForDate(date: string, periodStarts: string[]): CyclePhase | null {
  let lastStart: string | null = null;
  for (const start of periodStarts) {
    if (start > date) break;
    lastStart = start;
  }
  if (!lastStart) return null;

  const daysSince = daysBetween(parseDateKey(lastStart), parseDateKey(date));
  if (daysSince <= 5) return 'menstrual';
  if (daysSince <= 13) return 'follicular';
  if (daysSince <= 16) return 'ovulation';
  return 'luteal';
}

export function summarizeMoodByPhase(days: MoodDay[], periodStarts: string[]): PhaseMoodSummary[] {
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

    const phase = phaseForDate(day.date, periodStarts);
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
