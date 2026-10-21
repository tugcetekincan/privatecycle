/**
 * Pure data and helpers for cycle-phase-specific health and lifestyle tips.
 *
 * Categorizes actionable guidance into nutrition, movement, wellness, and mindset
 * for each of the four cycle phases (menstrual, follicular, ovulation, luteal).
 * Kept pure of SQLite/Expo so it is directly unit-testable.
 */

import { CyclePhase, PHASE_ORDER } from './MoodInsights';
import { daysBetween, parseDateKey } from './dateKey';

export { CyclePhase, PHASE_ORDER };

export type PhaseTipCategory = 'nutrition' | 'movement' | 'wellness' | 'mindset';

export interface PhaseTipItem {
  category: PhaseTipCategory;
  categoryLabel: string;
  title: string;
  description: string;
  iconEmoji: string;
}

export interface CyclePhaseInfo {
  phase: CyclePhase;
  title: string;
  dayRange: string;
  tagline: string;
  summary: string;
  hormones: string;
  tips: PhaseTipItem[];
}

export interface CurrentPhaseStatus {
  phase: CyclePhase;
  cycleDay: number;
  daysSinceLastPeriod: number;
}

export const CYCLE_PHASE_TIPS: Record<CyclePhase, CyclePhaseInfo> = {
  menstrual: {
    phase: 'menstrual',
    title: 'Menstrual Phase',
    dayRange: 'Days 1–6',
    tagline: 'Rest & Replenish',
    summary:
      'Hormones are at their baseline and energy is directed inward as your body sheds the uterine lining.',
    hormones: 'Low estrogen & progesterone',
    tips: [
      {
        category: 'nutrition',
        categoryLabel: 'NUTRITION',
        title: 'Replenish iron & minerals',
        description:
          'Focus on iron-rich foods (spinach, lentils, beans, lean meats) paired with vitamin C. Warm broths and magnesium support muscle relaxation.',
        iconEmoji: '🥑',
      },
      {
        category: 'movement',
        categoryLabel: 'MOVEMENT',
        title: 'Gentle & restorative',
        description:
          'Opt for slow walks, light stretching, or restorative yin yoga. If experiencing cramps or fatigue, prioritize complete rest without guilt.',
        iconEmoji: '🧘',
      },
      {
        category: 'wellness',
        categoryLabel: 'WELLNESS',
        title: 'Soothe cramps & warm up',
        description:
          'Apply a heating pad to your lower abdomen or lower back. Drink chamomile or ginger tea, take warm baths, and keep your body cozy.',
        iconEmoji: '🫖',
      },
      {
        category: 'mindset',
        categoryLabel: 'MINDSET',
        title: 'Turn inward & recharge',
        description:
          'Your energy is naturally introspective. Protect your schedule, reduce non-essential commitments, and prioritize 8+ hours of sleep.',
        iconEmoji: '🌙',
      },
    ],
  },
  follicular: {
    phase: 'follicular',
    title: 'Follicular Phase',
    dayRange: 'Days 7–14',
    tagline: 'Rising Energy & New Beginnings',
    summary:
      'Estrogen and FSH are on the rise, rebuilding the uterine lining and stimulating follicle growth as stamina rebounds.',
    hormones: 'Rising estrogen & FSH',
    tips: [
      {
        category: 'nutrition',
        categoryLabel: 'NUTRITION',
        title: 'Fresh & metabolically active',
        description:
          'Enjoy vibrant salads, fermented foods (sauerkraut, yogurt) to aid estrogen metabolism, complex carbs, and clean proteins.',
        iconEmoji: '🥗',
      },
      {
        category: 'movement',
        categoryLabel: 'MOVEMENT',
        title: 'Build strength & endurance',
        description:
          'Rising estrogen increases stamina and muscle recovery. Great time for resistance training, cardio, or trying new workout routines.',
        iconEmoji: '⚡',
      },
      {
        category: 'wellness',
        categoryLabel: 'WELLNESS',
        title: 'Nourish skin & vitality',
        description:
          'Higher estrogen boosts collagen and natural skin glow. Maintain regular hydration and support healthy circadian rhythms.',
        iconEmoji: '✨',
      },
      {
        category: 'mindset',
        categoryLabel: 'MINDSET',
        title: 'Brainstorm & initiate',
        description:
          'Cognitive energy, focus, and curiosity are elevated. An ideal phase for strategic planning, initiating projects, and learning new skills.',
        iconEmoji: '💡',
      },
    ],
  },
  ovulation: {
    phase: 'ovulation',
    title: 'Ovulatory Phase',
    dayRange: 'Days 15–17',
    tagline: 'Peak Vitality & Connection',
    summary:
      'Estrogen peaks and luteinizing hormone (LH) triggers ovulation. You are at your most fertile, energetic, and magnetic.',
    hormones: 'Peak estrogen & LH surge',
    tips: [
      {
        category: 'nutrition',
        categoryLabel: 'NUTRITION',
        title: 'Antioxidants & fiber',
        description:
          'Support your liver in metabolizing peak estrogen with cruciferous veggies (broccoli, cauliflower), berries, and high-fiber grains.',
        iconEmoji: '🫐',
      },
      {
        category: 'movement',
        categoryLabel: 'MOVEMENT',
        title: 'High intensity & peak performance',
        description:
          'Energy and pain tolerance are at their highest. Ideal time for personal bests, HIIT, spin class, or group workouts.',
        iconEmoji: '🔥',
      },
      {
        category: 'wellness',
        categoryLabel: 'WELLNESS',
        title: 'Listen to fertile signs',
        description:
          'Notice fertile cervical fluid, mild pelvic twinges, or libido changes. Stay well-hydrated to support joint mobility.',
        iconEmoji: '💧',
      },
      {
        category: 'mindset',
        categoryLabel: 'MINDSET',
        title: 'Socialize & communicate',
        description:
          'Verbal communication, empathy, and confidence are strongest now. Great for public speaking, networking, and collaborative projects.',
        iconEmoji: '🗣️',
      },
    ],
  },
  luteal: {
    phase: 'luteal',
    title: 'Luteal Phase',
    dayRange: 'Days 18–28+',
    tagline: 'Nourish, Steady & Wind Down',
    summary:
      'Progesterone rises to support the uterine lining, increasing resting metabolic rate before tapering off if pregnancy does not occur.',
    hormones: 'High progesterone, then tapering',
    tips: [
      {
        category: 'nutrition',
        categoryLabel: 'NUTRITION',
        title: 'Steady blood sugar & magnesium',
        description:
          'Eat complex carbs (sweet potatoes, oats, brown rice) and magnesium (pumpkin seeds, dark chocolate) to curb cravings and PMS.',
        iconEmoji: '🍠',
      },
      {
        category: 'movement',
        categoryLabel: 'MOVEMENT',
        title: 'Low-impact & steady flow',
        description:
          'Shift from high-strain workouts toward resistance training, Pilates, barre, or brisk walks as resting body temperature rises.',
        iconEmoji: '🚶‍♀️',
      },
      {
        category: 'wellness',
        categoryLabel: 'WELLNESS',
        title: 'Ease PMS & bloating',
        description:
          'Cut back on excess sodium and caffeine to reduce fluid retention and breast tenderness. Consider warm Epsom salt baths.',
        iconEmoji: '🛁',
      },
      {
        category: 'mindset',
        categoryLabel: 'MINDSET',
        title: 'Wrap up & set boundaries',
        description:
          'Focus shifts to organizing, detail work, and decluttering. Practice gentle self-care if irritability or mood dips occur.',
        iconEmoji: '🌿',
      },
    ],
  },
};

/**
 * Determines cycle phase from elapsed days since the start of the last period.
 * Mirrors `AnalyticsService.getCyclePhase` and `MoodInsights.phaseForDate`.
 */
export function determineCyclePhase(daysSince: number): CyclePhase {
  if (daysSince <= 5) return 'menstrual';
  if (daysSince <= 13) return 'follicular';
  if (daysSince <= 16) return 'ovulation';
  return 'luteal';
}

/**
 * Calculates current cycle day and phase for `todayDateKey` given sorted `periodStarts`.
 * Returns null if no recorded period start occurred on or before today.
 */
export function getCurrentPhaseStatus(
  todayDateKey: string,
  periodStarts: string[]
): CurrentPhaseStatus | null {
  if (!periodStarts || periodStarts.length === 0) return null;

  let lastStart: string | null = null;
  for (const start of periodStarts) {
    if (start > todayDateKey) break;
    lastStart = start;
  }
  if (!lastStart) return null;

  const daysSince = daysBetween(parseDateKey(lastStart), parseDateKey(todayDateKey));
  if (daysSince < 0) return null;

  const cycleDay = daysSince + 1;
  const phase = determineCyclePhase(daysSince);

  return {
    phase,
    cycleDay,
    daysSinceLastPeriod: daysSince,
  };
}
