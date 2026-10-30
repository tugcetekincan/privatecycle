/**
 * Short, actionable tips for the Insights Today card.
 *
 * Tips come from what was actually logged today (symptoms and mood), so the
 * card stays about today instead of repeating a historical pattern card. The
 * phase-level nudge is rendered separately (TODAY_FOCUS); this service only
 * returns personal, log-backed tips.
 *
 * Pure: no SQLite/Expo imports, so it is directly unit-testable.
 */

import { MOOD_OPTIONS } from './MoodTags';
import { symptomMeta } from './Symptoms';

export interface TodayLog {
  symptoms?: string[];
  moodValence?: number;
  moodTags?: { id: string; level?: number }[];
}

export interface TodayTip {
  icon: string;
  label: string;
  text: string;
}

const MAX_TIPS = 2;

const SYMPTOM_TIPS: Record<string, string> = {
  cramps: 'Use a heat pack and keep water nearby today.',
  headache: 'Keep water and meals regular, and rest your eyes when you can.',
  bloating: 'Go easy on salt and caffeine; a short walk may help.',
  mood: 'Name the feeling and keep the day lighter where you can.',
  fatigue: 'Protect your sleep tonight and keep meals steady today.',
  backache: 'Warmth and gentle stretching may ease your lower back.',
  breastache: 'A supportive bra and less caffeine may help today.',
};

const MOOD_TIPS: Record<string, string> = {
  happy: 'Notice what helped today so you can make room for it again.',
  calm: 'Protect the calm with a slower evening and a little daylight.',
  energetic: 'Put the energy into the task you keep postponing.',
  tired: 'Protect your sleep tonight and keep meals steady today.',
  low: 'Keep the day lighter and do one small thing that feels kind.',
  anxious: 'Try a slow breathing pause and lower the stakes for the next hour.',
  irritable: 'Name it, step away for a minute, and keep the evening quiet.',
  overwhelmed: 'Pick one next step and let the rest wait.',
};

const LOW_VALENCE_TIP =
  'Keep the day lighter and do one small thing that feels kind.';

const upper = (value: string): string => value.toUpperCase();

/**
 * Up to two tips for today: logged symptoms first, then mood tags. A low
 * overall mood adds a gentle fallback when no feeling tag explains it.
 */
export function buildTodayTips(log: TodayLog | null | undefined): TodayTip[] {
  const tips: TodayTip[] = [];
  const seen = new Set<string>();

  const add = (tip: TodayTip) => {
    const key = tip.text.toLowerCase();
    if (seen.has(key) || tips.length >= MAX_TIPS) return;
    seen.add(key);
    tips.push(tip);
  };

  for (const id of log?.symptoms ?? []) {
    const text = SYMPTOM_TIPS[id];
    if (!text) continue;
    const meta = symptomMeta(id);
    add({ icon: meta.icon, label: upper(meta.label), text });
    if (tips.length >= MAX_TIPS) return tips;
  }

  for (const tag of log?.moodTags ?? []) {
    const text = MOOD_TIPS[tag.id];
    if (!text) continue;
    const meta = MOOD_OPTIONS.find((option) => option.id === tag.id);
    add({
      icon: meta?.icon ?? '💭',
      label: upper(meta?.label ?? tag.id),
      text,
    });
    if (tips.length >= MAX_TIPS) return tips;
  }

  if ((log?.moodValence ?? 0) > 0 && (log?.moodValence ?? 0) <= 2) {
    add({ icon: '🌿', label: 'LOW MOOD', text: LOW_VALENCE_TIP });
  }

  return tips;
}
