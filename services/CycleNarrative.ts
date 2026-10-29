/**
 * Pure, display-ready narrative for the Insights tab: the "Your patterns"
 * cards and the personal pattern shown inside Today.
 *
 * The service does not query SQLite. It turns the already-computed symptom,
 * mood and cycle summaries into short, honest observations with their sample
 * sizes, so every card can say how much data backs it.
 */

import { CyclePhase, PHASE_LABELS, PHASE_ORDER } from './CycleModel';
import { PhaseMoodSummary } from './MoodInsights';
import { SymptomPattern } from './SymptomInsights';
import { summarizeCycleLengths } from './CycleTrends';
import { symptomMeta } from './Symptoms';

export type PatternKind = 'symptom' | 'mood' | 'cycle';
export type PatternTipLabel = 'TRY THIS' | 'WHY IT MATTERS';

export interface PhaseShare {
  phase: CyclePhase;
  /** Share of all days with this symptom, including unphased days. */
  share: number;
}

export interface SymptomVisual {
  type: 'phase';
  shares: PhaseShare[];
  /** Share of symptom days that have no cycle phase yet. */
  unphasedShare: number;
}

export interface MoodVisual {
  type: 'mood';
  rows: { phase: CyclePhase; label: string; value: number }[];
}

export interface RangeVisual {
  type: 'range';
  min: number;
  max: number;
  average: number;
}

export type PatternVisual = SymptomVisual | MoodVisual | RangeVisual;

export interface NarrativePattern {
  id: string;
  kind: PatternKind;
  icon: string;
  title: string;
  body: string;
  /** Sample-size chip, e.g. "13 headache days". */
  sampleLabel: string;
  statValue: string;
  statLabel: string;
  tipLabel: PatternTipLabel;
  tip: string;
  visual: PatternVisual;
  /** Phase this pattern is mostly tied to; null for cycle regularity. */
  phase: CyclePhase | null;
}

export interface TodayPattern {
  icon: string;
  title: string;
  body: string;
}

export interface NarrativeInput {
  symptomPatterns: SymptomPattern[];
  moodPhases: PhaseMoodSummary[];
  periodStarts: string[];
}

export interface NarrativeResult {
  patterns: NarrativePattern[];
  todayPattern: TodayPattern | null;
}

/** Short, non-prescriptive suggestions keyed by symptom id. */
const SYMPTOM_TIPS: Record<string, string> = {
  cramps: 'Heat, gentle movement and magnesium-rich foods may help.',
  headache: 'Regular meals, water and sleep. Watch whether it repeats next cycle.',
  bloating: 'Lower sodium and gentle walks may help in the luteal phase.',
  mood: 'Name the feeling and keep the day lighter where you can.',
  fatigue: 'Protect sleep and keep meals steady when energy dips.',
  backache: 'Warmth and stretching may ease lower-back tension.',
  breastache: 'A supportive bra and less caffeine may help.',
};

/** Shorter versions for the Today card's personal row. */
const TODAY_TIPS: Record<string, string> = {
  cramps: 'Keep water and a heat pack close.',
  headache: 'Keep water and meals regular.',
  bloating: 'Go easy on salt and caffeine.',
  mood: 'Name the feeling and lower the stakes.',
  fatigue: 'Protect sleep and keep meals steady.',
  backache: 'Warmth and gentle stretching may help.',
  breastache: 'A supportive bra and less caffeine may help.',
};

/** Symptom ids that read as plural in a sentence. */
const PLURAL_SYMPTOMS = new Set(['cramps', 'headache', 'mood']);

/** Display plurals that differ from the catalog label. */
const PLURAL_LABELS: Record<string, string> = {
  headache: 'Headaches',
  mood: 'Mood changes',
};

/** Natural day nouns for the sample chip and body. */
const DAY_NOUNS: Record<string, string> = {
  cramps: 'cramp days',
  headache: 'headache days',
  bloating: 'bloating days',
  mood: 'mood-change days',
  fatigue: 'fatigue days',
  backache: 'back-pain days',
  breastache: 'breast-pain days',
};

const DEFAULT_TIP = 'Keep logging to see whether this pattern holds next cycle.';

const sentenceCase = (value: string): string =>
  value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

const phaseLabel = (phase: CyclePhase): string => PHASE_LABELS[phase].toLowerCase();

const strongSymptomPatterns = (patterns: SymptomPattern[]): SymptomPattern[] =>
  patterns
    .filter(
      (pattern) =>
        pattern.days >= 3 &&
        pattern.phasedDays >= 3 &&
        pattern.dominantPhase !== null &&
        pattern.dominantShare >= 0.5
    )
    .sort((a, b) => b.dominantShare - a.dominantShare || b.days - a.days);

const symptomPatternCard = (patterns: SymptomPattern[]): NarrativePattern | null => {
  const pattern = strongSymptomPatterns(patterns)[0];
  if (!pattern || !pattern.dominantPhase) return null;

  const meta = symptomMeta(pattern.id);
  const phase = pattern.dominantPhase;
  const noun = DAY_NOUNS[pattern.id] ?? `${meta.label.toLowerCase()} days`;
  const label = PLURAL_LABELS[pattern.id] ?? sentenceCase(meta.label);
  const dominantDays = pattern.phaseDays[phase];
  const share = dominantDays / pattern.days;
  const unphasedShare = Math.max(0, (pattern.days - pattern.phasedDays) / pattern.days);

  return {
    id: `symptom-${pattern.id}`,
    kind: 'symptom',
    icon: meta.icon,
    title: `${label} · mostly ${phaseLabel(phase)}`,
    body: `${dominantDays} of your ${pattern.days} ${noun} fell in your ${phaseLabel(phase)} phase.`,
    sampleLabel: `${pattern.days} ${noun}`,
    statValue: `${Math.round(share * 100)}%`,
    statLabel: `in ${phaseLabel(phase)}`,
    tipLabel: 'TRY THIS',
    tip: SYMPTOM_TIPS[pattern.id] ?? DEFAULT_TIP,
    visual: {
      type: 'phase',
      shares: PHASE_ORDER.map((phaseName) => ({
        phase: phaseName,
        share: pattern.phaseDays[phaseName] / pattern.days,
      })),
      unphasedShare,
    },
    phase,
  };
};

const moodPatternCard = (moodPhases: PhaseMoodSummary[]): NarrativePattern | null => {
  const phases = moodPhases.filter(
    (entry) => entry.averageValence !== null && entry.days >= 2
  );
  if (phases.length < 2) return null;

  const sorted = [...phases].sort(
    (a, b) => (a.averageValence ?? 0) - (b.averageValence ?? 0)
  );
  const worst = sorted[0];
  const best = sorted[sorted.length - 1];
  const bestAverage = best.averageValence;
  const worstAverage = worst.averageValence;
  if (bestAverage === null || worstAverage === null) return null;

  const difference = bestAverage - worstAverage;
  if (difference < 0.4) return null;

  const totalMoodDays = moodPhases.reduce((total, entry) => total + entry.days, 0);

  return {
    id: 'mood',
    kind: 'mood',
    icon: '🙂',
    title: `Mood is highest in your ${phaseLabel(best.phase)} phase`,
    body: `You average ${bestAverage.toFixed(1)}/5 in ${phaseLabel(
      best.phase
    )} versus ${worstAverage.toFixed(1)}/5 in ${phaseLabel(worst.phase)}.`,
    sampleLabel: `${totalMoodDays} mood ${totalMoodDays === 1 ? 'day' : 'days'}`,
    statValue: `+${difference.toFixed(1)}`,
    statLabel: `vs ${phaseLabel(worst.phase)}`,
    tipLabel: 'TRY THIS',
    tip: `Plan demanding work for your ${phaseLabel(
      best.phase
    )} window; keep the ${phaseLabel(worst.phase)} phase lighter where you can.`,
    visual: {
      type: 'mood',
      rows: [
        { phase: best.phase, label: PHASE_LABELS[best.phase], value: bestAverage },
        { phase: worst.phase, label: PHASE_LABELS[worst.phase], value: worstAverage },
      ],
    },
    phase: worst.phase,
  };
};

const cyclePatternCard = (periodStarts: string[]): NarrativePattern | null => {
  const summary = summarizeCycleLengths(periodStarts);
  if (
    summary.points.length < 2 ||
    summary.average === null ||
    summary.min === null ||
    summary.max === null
  ) {
    return null;
  }

  const regular = summary.regularity === 'regular';
  const count = summary.points.length;

  return {
    id: 'cycle',
    kind: 'cycle',
    icon: '📅',
    title: `Your cycle is ${regular ? 'regular' : 'variable'}`,
    body: `Your last ${count} cycles ranged from ${summary.min} to ${summary.max} days.`,
    sampleLabel: `${count} tracked ${count === 1 ? 'cycle' : 'cycles'}`,
    statValue: `${Math.round(summary.average)}d`,
    statLabel: 'average',
    tipLabel: 'WHY IT MATTERS',
    tip: regular
      ? 'Steady cycles make your period and fertile-window predictions more reliable.'
      : 'Cycle length can vary for many reasons. Predictions may be less precise; keep logging to see your pattern.',
    visual: {
      type: 'range',
      min: summary.min,
      max: summary.max,
      average: summary.average,
    },
    phase: null,
  };
};

const todaySymptomPattern = (
  patterns: SymptomPattern[],
  currentPhase: CyclePhase
): TodayPattern | null => {
  const pattern = strongSymptomPatterns(patterns).find(
    (entry) => entry.dominantPhase === currentPhase
  );
  if (!pattern || !pattern.dominantPhase) return null;

  const meta = symptomMeta(pattern.id);
  const plural = PLURAL_SYMPTOMS.has(pattern.id);
  const label = PLURAL_LABELS[pattern.id] ?? sentenceCase(meta.label);
  const noun = DAY_NOUNS[pattern.id] ?? `${meta.label.toLowerCase()} days`;
  const dominantDays = pattern.phaseDays[pattern.dominantPhase];

  return {
    icon: meta.icon,
    title: `${label} ${plural ? 'tend' : 'tends'} to show up now`,
    body: `${dominantDays} of your ${pattern.days} ${noun} fell in ${phaseLabel(
      pattern.dominantPhase
    )}. ${TODAY_TIPS[pattern.id] ?? ''}`.trim(),
  };
};

const todayMoodPattern = (
  moodCard: NarrativePattern | null,
  currentPhase: CyclePhase
): TodayPattern | null => {
  if (!moodCard || moodCard.phase !== currentPhase) return null;
  return {
    icon: moodCard.icon,
    title: 'Your mood tends to dip now',
    body: `${moodCard.body} Keep the day lighter where you can.`,
  };
};

/**
 * When the current phase has no matching pattern, still surface the strongest
 * symptom pattern as context, phrased as a "usually" rather than a "now".
 */
const todayFallbackPattern = (patterns: SymptomPattern[]): TodayPattern | null => {
  const pattern = strongSymptomPatterns(patterns)[0];
  if (!pattern || !pattern.dominantPhase) return null;

  const meta = symptomMeta(pattern.id);
  const plural = PLURAL_SYMPTOMS.has(pattern.id);
  const label = PLURAL_LABELS[pattern.id] ?? sentenceCase(meta.label);
  const noun = DAY_NOUNS[pattern.id] ?? `${meta.label.toLowerCase()} days`;
  const dominantDays = pattern.phaseDays[pattern.dominantPhase];

  return {
    icon: meta.icon,
    title: `${label} usually ${
      plural ? 'show' : 'shows'
    } up in your ${phaseLabel(pattern.dominantPhase)} phase`,
    body: `${dominantDays} of your ${pattern.days} ${noun} fell in ${phaseLabel(
      pattern.dominantPhase
    )}. ${TODAY_TIPS[pattern.id] ?? ''}`.trim(),
  };
};

/**
 * Build the pattern cards (strongest symptom, mood contrast, cycle regularity)
 * and the one personal row that is relevant to the current phase.
 */
export function buildNarrative(
  input: NarrativeInput,
  currentPhase: CyclePhase | null
): NarrativeResult {
  const moodCard = moodPatternCard(input.moodPhases);
  const patterns = [
    symptomPatternCard(input.symptomPatterns),
    moodCard,
    cyclePatternCard(input.periodStarts),
  ].filter((pattern): pattern is NarrativePattern => pattern !== null);

  const matchingToday = currentPhase
    ? todaySymptomPattern(input.symptomPatterns, currentPhase) ??
      todayMoodPattern(moodCard, currentPhase)
    : null;

  return {
    patterns,
    todayPattern:
      matchingToday ?? (currentPhase ? todayFallbackPattern(input.symptomPatterns) : null),
  };
}
