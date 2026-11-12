import type { BackupData } from './BackupService';

/**
 * Deep validation for backup files before anything is written to SQLite.
 *
 * `BackupData` is a public interface: users keep these files, so validation
 * accepts every field shape this app has ever written (for example, days from
 * before mood detail existed) and ignores unknown extra fields. It only rejects
 * values that could not have come from the app and would make a restore unsafe.
 */

export const BACKUP_VERSION = '1.0.0';
export const SUPPORTED_BACKUP_VERSIONS: readonly string[] = [BACKUP_VERSION];

/** Local backups are tiny; this only stops a mistaken or malicious huge file. */
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
/** Roughly 55 years of daily logging. */
export const MAX_BACKUP_ENTRIES = 20_000;
export const MAX_SYMPTOMS_PER_DAY = 50;
export const MAX_MOOD_TAGS_PER_DAY = 50;

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * True for a `YYYY-MM-DD` key that is a real calendar day. Uses UTC so the
 * result does not depend on the importing device's timezone (or its DST rules).
 */
export const isRealDateKey = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;

  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const isStringArray = (value: unknown, maxLength: number): value is string[] =>
  Array.isArray(value) &&
  value.length <= maxLength &&
  value.every((item) => typeof item === 'string' && item.length > 0);

const isMoodTags = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length > MAX_MOOD_TAGS_PER_DAY) {
    return false;
  }

  return value.every((tag) => {
    if (!isPlainObject(tag)) return false;
    if (typeof tag.id !== 'string' || tag.id.length === 0) return false;
    return tag.level === 1 || tag.level === 2 || tag.level === 3;
  });
};

const isDailyEntry = (key: string, value: unknown): boolean => {
  if (!isPlainObject(value)) return false;

  // The entry's own date must match its map key; restore always writes by key.
  if (value.date !== key) return false;
  if (typeof value.isPeriod !== 'boolean') return false;
  if (typeof value.flowLevel !== 'string') return false;
  if (typeof value.mood !== 'string') return false;
  if (!isStringArray(value.symptoms, MAX_SYMPTOMS_PER_DAY)) return false;

  // Optional because backups from before ovulation tracking predate the field.
  if (value.isOvulation !== undefined && typeof value.isOvulation !== 'boolean') {
    return false;
  }

  // Optional since the mood-detail release; absent in older backups.
  if (value.moodValence !== undefined) {
    if (
      typeof value.moodValence !== 'number' ||
      !Number.isInteger(value.moodValence) ||
      value.moodValence < 0 ||
      value.moodValence > 5
    ) {
      return false;
    }
  }

  if (value.moodTags !== undefined && !isMoodTags(value.moodTags)) {
    return false;
  }

  return true;
};

const isIntimateEntry = (key: string, value: unknown): boolean => {
  if (!isPlainObject(value)) return false;
  if (value.date !== key) return false;
  if (typeof value.protection !== 'string') return false;
  if (typeof value.note !== 'string') return false;

  return true;
};

const isDateRange = (value: unknown): boolean => {
  if (!isPlainObject(value)) return false;

  const { start, end } = value;
  if (!(start === null || isRealDateKey(start))) return false;
  if (!(end === null || isRealDateKey(end))) return false;
  if (typeof start === 'string' && typeof end === 'string' && start > end) {
    return false;
  }

  return true;
};

export const validateBackupPayload = (data: unknown): data is BackupData => {
  if (!isPlainObject(data)) return false;

  if (
    typeof data.version !== 'string' ||
    !SUPPORTED_BACKUP_VERSIONS.includes(data.version)
  ) {
    return false;
  }

  if (
    typeof data.timestamp !== 'number' ||
    !Number.isFinite(data.timestamp) ||
    data.timestamp <= 0
  ) {
    return false;
  }

  if (!isPlainObject(data.data) || !isPlainObject(data.metadata)) {
    return false;
  }

  const { dailyData, intimateData } = data.data;
  if (!isPlainObject(dailyData)) return false;

  const dailyEntries = Object.entries(dailyData);
  if (dailyEntries.length > MAX_BACKUP_ENTRIES) return false;
  for (const [key, entry] of dailyEntries) {
    if (!isRealDateKey(key) || !isDailyEntry(key, entry)) return false;
  }

  if (intimateData !== undefined) {
    if (!isPlainObject(intimateData)) return false;

    const privateEntries = Object.entries(intimateData);
    if (privateEntries.length > MAX_BACKUP_ENTRIES) return false;
    for (const [key, entry] of privateEntries) {
      if (!isRealDateKey(key) || !isIntimateEntry(key, entry)) return false;
    }
  }

  const { totalDays, dateRange, includesPrivateData, privateDays } = data.metadata;

  if (
    typeof totalDays !== 'number' ||
    !Number.isInteger(totalDays) ||
    totalDays < 0
  ) {
    return false;
  }

  if (!isDateRange(dateRange)) return false;

  if (includesPrivateData !== undefined && typeof includesPrivateData !== 'boolean') {
    return false;
  }

  if (
    privateDays !== undefined &&
    (typeof privateDays !== 'number' ||
      !Number.isInteger(privateDays) ||
      privateDays < 0)
  ) {
    return false;
  }

  return true;
};
