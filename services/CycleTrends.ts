/**
 * Pure math for the Overview tab: how long recent cycles lasted, how much they
 * varied, and how the current cycle splits into phases for the hero track.
 *
 * Kept free of SQLite/Expo so it is directly unit-testable. All dates are local
 * `YYYY-MM-DD` day keys and compare chronologically as strings.
 */

import { CyclePhase, CycleWindow, MENSTRUAL_PHASE_DAYS } from './CycleModel';
import { daysBetween, parseDateKey } from './dateKey';

/** How many completed cycles the Overview chart and variation use. */
export const CYCLE_HISTORY_LIMIT = 6;

export interface CycleLengthPoint {
  /** First day of the cycle. */
  start: string;
  /** First day of the next cycle. */
  end: string;
  /** Days from start through the day before `end`. */
  length: number;
}

export interface CycleLengthSummary {
  /** Most recent completed cycles, ascending. */
  points: CycleLengthPoint[];
  lengths: number[];
  /** Mean length of the points, null with no completed cycle. */
  average: number | null;
  min: number | null;
  max: number | null;
  /** Half the observed range, rounded; null until two completed cycles. */
  halfRange: number | null;
  /** Regular when the observed range is at most four days. */
  regularity: 'regular' | 'variable' | null;
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

/**
 * Summarise the most recent completed cycles. A cycle length needs two period
 * starts, so one period start returns an empty summary; one completed cycle
 * returns its length but no variation yet.
 */
export function summarizeCycleLengths(
  periodStarts: string[],
  limit: number = CYCLE_HISTORY_LIMIT
): CycleLengthSummary {
  const sorted = [...periodStarts].sort();
  const all: CycleLengthPoint[] = [];

  for (let index = 1; index < sorted.length; index++) {
    all.push({
      start: sorted[index - 1],
      end: sorted[index],
      length: daysBetween(parseDateKey(sorted[index - 1]), parseDateKey(sorted[index])),
    });
  }

  const points = limit > 0 ? all.slice(-Math.floor(limit)) : [];
  const lengths = points.map((point) => point.length);

  if (lengths.length === 0) {
    return {
      points: [],
      lengths: [],
      average: null,
      min: null,
      max: null,
      halfRange: null,
      regularity: null,
    };
  }

  const average = sum(lengths) / lengths.length;
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);
  const hasRange = lengths.length >= 2;

  return {
    points,
    lengths,
    average,
    min,
    max,
    halfRange: hasRange ? Math.round((max - min) / 2) : null,
    regularity: hasRange ? (max - min <= 4 ? 'regular' : 'variable') : null,
  };
}

export interface PhaseTrackSegment {
  phase: CyclePhase;
  days: number;
  /** Share of the cycle, 0-1. */
  share: number;
}

/**
 * Split a cycle window into the four phase segments shown in the Overview
 * hero. Uses the same window bounds as `phaseForDateInWindows`, including the
 * recorded-ovulation overrides, instead of fixed day-14 thresholds.
 */
export function phaseTrackSegments(window: CycleWindow): PhaseTrackSegment[] {
  const total = Math.max(1, daysBetween(parseDateKey(window.start), parseDateKey(window.end)));
  let remaining = total;

  const menstrual = Math.min(MENSTRUAL_PHASE_DAYS, remaining);
  remaining -= menstrual;

  const follicular = Math.min(
    Math.max(0, daysBetween(parseDateKey(window.start), parseDateKey(window.ovulationPhaseStart)) - menstrual),
    remaining
  );
  remaining -= follicular;

  const ovulation = Math.min(
    Math.max(0, daysBetween(parseDateKey(window.ovulationPhaseStart), parseDateKey(window.ovulationPhaseEnd)) + 1),
    remaining
  );
  remaining -= ovulation;

  const days: Record<CyclePhase, number> = {
    menstrual,
    follicular,
    ovulation,
    luteal: remaining,
  };

  return (['menstrual', 'follicular', 'ovulation', 'luteal'] as CyclePhase[]).map((phase) => ({
    phase,
    days: days[phase],
    share: days[phase] / total,
  }));
}
