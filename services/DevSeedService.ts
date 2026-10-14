import { DataService, DailyData } from './DataService';
import { MoodTag, MoodTagLevel } from './MoodTags';

/**
 * Deterministic demo-data generator for development and automated tests.
 *
 * Given the same options it always produces the same days, so screenshots and
 * smoke assertions are reproducible. Data ends "today" by default, which keeps
 * calendar and prediction views interesting.
 *
 * Used by:
 *  - `?seed=1` / `?seed=force` / `?reset=1` on web (see hooks/useDevSeed.ts)
 *  - the Developer section in Settings (`__DEV__` only)
 *  - unit tests (pure `generateDemoDailyData`)
 */

export interface DemoDataOptions {
  /** Number of days to generate, ending on `endDate`. Default 126 (18 weeks). */
  days?: number;
  /** Last generated day. Default: today (local time). */
  endDate?: Date;
  /** RNG seed. Same seed + same options => same data. */
  seed?: number;
}

export interface SeedResult {
  days: number;
  skipped: boolean;
}

const DEFAULT_DAYS = 126;
const DEFAULT_RNG_SEED = 0x5eed;

const SYMPTOM_POOL = [
  'cramps',
  'headache',
  'bloating',
  'mood',
  'fatigue',
  'backache',
  'breastache',
] as const;

const MOOD_TAG_POOL = [
  'happy',
  'calm',
  'energetic',
  'tired',
  'low',
  'anxious',
  'irritable',
  'overwhelmed',
] as const;

// Valence-matched pools so demo feelings cluster where you would expect them.
const POSITIVE_MOOD_TAGS = ['happy', 'calm', 'energetic'] as const;
const NEGATIVE_MOOD_TAGS = ['tired', 'low', 'anxious', 'irritable', 'overwhelmed'] as const;

/** Small, fast, deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDemoDailyData(options: DemoDataOptions = {}): Record<string, DailyData> {
  const days = options.days ?? DEFAULT_DAYS;
  const endDate = options.endDate ?? new Date();
  const rng = mulberry32(options.seed ?? DEFAULT_RNG_SEED);

  // Lay out periods backwards from the end of the window: one start roughly
  // every 26-30 days, each lasting 4-6 days. Offsets are days relative to
  // endDate (0 = endDate, negative = earlier).
  const periodDays = new Set<number>();
  const ovulationDays = new Set<number>();
  const periodStarts: number[] = [];
  const flowByOffset = new Map<number, string>();
  let cursor = -days + 6;
  while (cursor <= 0) {
    const start = cursor;
    periodStarts.push(start);
    const length = 4 + Math.floor(rng() * 3);
    const end = Math.min(cursor + length, 1); // clamp so today can be a period day
    for (let offset = cursor; offset < end; offset++) {
      const index = offset - cursor;
      periodDays.add(offset);
      flowByOffset.set(offset, index === 0 ? 'light' : index <= 2 ? 'medium' : 'light');
    }
    // One estimated ovulation per cycle, 13-15 days after the period start,
    // so both recorded history and forecasts have data to show.
    ovulationDays.add(start + 13 + Math.floor(rng() * 3));
    cursor += 26 + Math.floor(rng() * 5);
  }

  const data: Record<string, DailyData> = {};

  for (let offset = -days + 1; offset <= 0; offset++) {
    const date = new Date(endDate);
    date.setDate(date.getDate() + offset);
    const dateKey = DataService.formatDateKey(date);
    const isPeriod = periodDays.has(offset);
    const isOvulation = ovulationDays.has(offset);

    const symptoms: string[] = [];
    if (isPeriod) {
      if (rng() < 0.75) symptoms.push('cramps');
      if (rng() < 0.35) symptoms.push('headache');
      if (rng() < 0.25) symptoms.push('fatigue');
    } else {
      if (rng() < 0.2) symptoms.push(SYMPTOM_POOL[Math.floor(rng() * SYMPTOM_POOL.length)]);
      if (rng() < 0.08) symptoms.push(SYMPTOM_POOL[Math.floor(rng() * SYMPTOM_POOL.length)]);
    }

    // Mood: valence follows the cycle (lower during the period, higher around
    // the fertile window, mid in the luteal phase) with small jitter, so demo
    // insights have a realistic shape. Tags come from a valence-matched pool.
    let lastStart = periodStarts[0];
    for (const start of periodStarts) {
      if (start <= offset) lastStart = start;
    }
    const daysSinceStart = offset - lastStart;
    const baseValence =
      daysSinceStart < 0 ? 3 : daysSinceStart <= 5 ? 2 : daysSinceStart <= 16 ? 4 : 3;
    const jitter = rng() < 0.3 ? (rng() < 0.5 ? -1 : 1) : 0;
    const moodValence = Math.max(1, Math.min(5, baseValence + jitter));

    const tagPool =
      moodValence <= 2 ? NEGATIVE_MOOD_TAGS : moodValence >= 4 ? POSITIVE_MOOD_TAGS : MOOD_TAG_POOL;
    const tagCount = 1 + (rng() < 0.5 ? 1 : 0) + (rng() < 0.25 ? 1 : 0);
    const moodTags: MoodTag[] = [];
    while (moodTags.length < tagCount) {
      const id = tagPool[Math.floor(rng() * tagPool.length)];
      if (moodTags.some((tag) => tag.id === id)) continue;
      moodTags.push({ id, level: (1 + Math.floor(rng() * 3)) as MoodTagLevel });
    }

    data[dateKey] = {
      date: dateKey,
      isPeriod,
      flowLevel: isPeriod ? (flowByOffset.get(offset) ?? 'medium') : '',
      symptoms: [...new Set(symptoms)],
      mood: moodTags[0].id,
      moodValence,
      moodTags,
      isOvulation,
    };
  }

  return data;
}

/**
 * Populate the database with demo data. Without `force`, existing data is left
 * untouched and `skipped` is true.
 */
export async function seedDemoData(
  options: DemoDataOptions & { force?: boolean } = {}
): Promise<SeedResult> {
  if (!options.force) {
    const existing = await DataService.getAllDailyData();
    if (Object.keys(existing).length > 0) {
      return { days: 0, skipped: true };
    }
  }

  const data = generateDemoDailyData(options);
  await DataService.clearAllData();
  await DataService.saveManyDailyData(data);
  return { days: Object.keys(data).length, skipped: false };
}

/** Delete all tracking data (demo helper; does not touch backups). */
export async function resetDemoData(): Promise<void> {
  await DataService.clearAllData();
}
