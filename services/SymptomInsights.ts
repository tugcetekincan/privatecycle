/**
 * Pure math for the Insights "Symptom Patterns" section: how often each
 * symptom was logged and how those days split across cycle phases.
 *
 * Phases come from `MoodInsights.phaseForDate`, which shares the thresholds
 * used by AnalyticsService and the phase tips. Kept free of SQLite/Expo so it
 * is unit-testable.
 */

import { CyclePhase, PHASE_ORDER, phaseForDate } from './MoodInsights';

export interface SymptomDay {
  date: string;
  symptoms: string[];
}

export type SymptomPhaseDays = Record<CyclePhase, number>;

export interface SymptomPattern {
  id: string;
  /** Days the symptom was logged (including days before the first record). */
  days: number;
  /** Share of all tracked days the symptom was logged on (0-1). */
  rate: number;
  /** Logged days per phase. */
  phaseDays: SymptomPhaseDays;
  /** Phase split of the logged days that have a phase (0-1). */
  phaseShares: SymptomPhaseDays;
  /** Logged days that fell into a recorded cycle phase. */
  phasedDays: number;
  /** Phase with the most logged days; null when no day has a phase. */
  dominantPhase: CyclePhase | null;
  /** Share of `phasedDays` in `dominantPhase` (0-1). */
  dominantShare: number;
}

export interface SymptomPatternSummary {
  /** Days with any daily entry, the denominator for `rate`. */
  trackedDays: number;
  patterns: SymptomPattern[];
  /** Symptom-days before the first recorded period start (no phase). */
  unphasedDays: number;
}

const emptyPhaseDays = (): SymptomPhaseDays => ({
  menstrual: 0,
  follicular: 0,
  ovulation: 0,
  luteal: 0,
});

/**
 * Aggregate symptom days into the most frequent patterns. `days` may cover
 * every entry (including empty symptom lists); duplicates within one day are
 * counted once. `trackedDays` is passed separately so the caller can count all
 * rows without loading them.
 */
export function summarizeSymptomPatterns(
  days: SymptomDay[],
  periodStarts: string[],
  trackedDays: number,
  limit = 4
): SymptomPatternSummary {
  const totals = new Map<
    string,
    { days: number; phaseDays: SymptomPhaseDays; phasedDays: number; unphasedDays: number }
  >();

  for (const day of days) {
    const symptoms = [...new Set(day.symptoms)].filter(Boolean);
    if (symptoms.length === 0) continue;

    const phase = phaseForDate(day.date, periodStarts);
    for (const id of symptoms) {
      let entry = totals.get(id);
      if (!entry) {
        entry = { days: 0, phaseDays: emptyPhaseDays(), phasedDays: 0, unphasedDays: 0 };
        totals.set(id, entry);
      }

      entry.days += 1;
      if (phase) {
        entry.phaseDays[phase] += 1;
        entry.phasedDays += 1;
      } else {
        entry.unphasedDays += 1;
      }
    }
  }

  const patterns = [...totals.entries()]
    .map(([id, entry]): SymptomPattern => {
      const dominant = PHASE_ORDER.reduce<CyclePhase>(
        (best, phase) =>
          entry.phaseDays[phase] > entry.phaseDays[best] ? phase : best,
        PHASE_ORDER[0]
      );
      const dominantPhase = entry.phasedDays > 0 ? dominant : null;

      const phaseShares = emptyPhaseDays();
      if (entry.phasedDays > 0) {
        for (const phase of PHASE_ORDER) {
          phaseShares[phase] = entry.phaseDays[phase] / entry.phasedDays;
        }
      }

      return {
        id,
        days: entry.days,
        rate: trackedDays > 0 ? entry.days / trackedDays : 0,
        phaseDays: entry.phaseDays,
        phaseShares,
        phasedDays: entry.phasedDays,
        dominantPhase,
        dominantShare:
          dominantPhase !== null ? entry.phaseDays[dominantPhase] / entry.phasedDays : 0,
      };
    })
    .sort((a, b) => b.days - a.days || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));

  const unphasedDays = [...totals.values()].reduce(
    (sum, entry) => sum + entry.unphasedDays,
    0
  );

  return {
    trackedDays: Math.max(0, trackedDays),
    patterns,
    unphasedDays,
  };
}
