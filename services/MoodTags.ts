/**
 * Mood detail model: a single overall valence (1-5, 0 = not set) plus
 * multi-select feeling tags, each with an intensity level (1-3).
 *
 * Stored in `daily_data` as `mood_valence` / `mood_tags` (JSON). The legacy
 * `mood` TEXT column keeps mirroring the primary tag id so the calendar and
 * insights keep working unchanged, and backups stay backward compatible.
 */

export const MOOD_TAG_MAX_LEVEL = 3;

export type MoodTagLevel = 1 | 2 | 3;

export interface MoodTag {
  id: string;
  level: MoodTagLevel;
}

export interface MoodValue {
  /** 0 = not set, otherwise 1-5 ("Rough" .. "Great"). */
  valence: number;
  tags: MoodTag[];
}

function clampLevel(level: number): MoodTagLevel {
  if (!Number.isFinite(level) || level < 1) return 1;
  if (level > MOOD_TAG_MAX_LEVEL) return MOOD_TAG_MAX_LEVEL;
  return Math.round(level) as MoodTagLevel;
}

/**
 * Parse the `mood_tags` JSON column. Garbage in, [] out; duplicate ids are
 * dropped; out-of-range levels are clamped to 1-3.
 */
export function parseMoodTags(raw: string | null | undefined): MoodTag[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const tags: MoodTag[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry.id !== 'string' || entry.id === '') continue;
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      const level = typeof entry.level === 'number' ? entry.level : 1;
      tags.push({ id: entry.id, level: clampLevel(level) });
    }
    return tags;
  } catch {
    return [];
  }
}

export function serializeMoodTags(tags: MoodTag[]): string {
  return JSON.stringify(tags);
}

/**
 * Chip tap behaviour: not selected -> add at level 1; selected -> bump
 * 1 -> 2 -> 3 -> 1.
 */
export function cycleMoodTag(tags: MoodTag[], id: string): MoodTag[] {
  const existing = tags.find((tag) => tag.id === id);
  if (!existing) {
    return [...tags, { id, level: 1 }];
  }
  return tags.map((tag) =>
    tag.id === id
      ? { ...tag, level: ((tag.level % MOOD_TAG_MAX_LEVEL) + 1) as MoodTagLevel }
      : tag
  );
}

export function removeMoodTag(tags: MoodTag[], id: string): MoodTag[] {
  return tags.filter((tag) => tag.id !== id);
}

/** The legacy `mood` column mirrors the first selected tag. */
export function primaryMoodId(tags: MoodTag[]): string {
  return tags[0]?.id ?? '';
}
