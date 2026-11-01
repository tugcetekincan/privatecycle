/**
 * Local-time day keys shared by the data layer and the forecast math.
 *
 * A day key is `YYYY-MM-DD` for the device's local calendar day. Never build
 * keys with `toISOString()` — it converts to UTC first and shifts the date in
 * negative-offset timezones (see AGENTS.md).
 *
 * The bottom half exposes live-`Intl` helpers for the notification scheduler:
 * Hermes caches the default `Date` timezone, so reminder wall-clock math must
 * not rely on it after the phone changes zones.
 */

export const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Local midnight for a `YYYY-MM-DD` key. */
export const parseDateKey = (key: string): Date => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

/** Whole days between two local midnights (DST-safe). */
export const daysBetween = (start: Date, end: Date): number =>
  Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));

/* ---------------------------------------------------------------------------
 * Live-timezone helpers
 *
 * Hermes caches the default timezone: after the phone changes zones, `new
 * Date()` keeps the old offset until the JS context restarts, while `Intl`
 * reflects the new zone immediately (react-native#59131). The reminder
 * scheduler must follow the phone's actual wall clock, so these helpers avoid
 * the cached default timezone entirely.
 * ------------------------------------------------------------------------- */

const pad = (value: number): string => String(value).padStart(2, '0');

/** Add calendar days to a day key without going through the default timezone. */
export const addDaysToDateKey = (key: string, days: number): string => {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

export interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const zonedFormatterCache = new Map<string, Intl.DateTimeFormat>();

const zonedFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const cached = zonedFormatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  zonedFormatterCache.set(timeZone, formatter);
  return formatter;
};

const zonedParts = (date: Date, timeZone: string): ZonedDateParts => {
  const parts = zonedFormatter(timeZone).formatToParts(date);

  const read = (type: string): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part ? Number(part.value) : 0;
  };

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    // Some ICU builds render midnight as 24; normalize it.
    hour: read('hour') % 24,
    minute: read('minute'),
    second: read('second'),
  };
};

/** Offset of `timeZone` at `date`, in milliseconds east of UTC. */
const zonedOffsetMs = (date: Date, timeZone: string): number => {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
};

/** Calendar day in a live timezone, e.g. for the scheduler's "today". */
export const getDateKeyInTimeZone = (date: Date, timeZone: string): string => {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${pad(month)}-${pad(day)}`;
};

/** Local wall-clock parts in a live timezone. */
export const getDateTimeInTimeZone = (
  date: Date,
  timeZone: string
): ZonedDateParts => zonedParts(date, timeZone);

/**
 * Absolute Date for a wall-clock time in a live IANA timezone. This cannot use
 * `new Date(year, month, day, hour)` because Hermes may still be using the
 * previous zone from before the user travelled.
 */
export const dateKeyAtTimeInTimeZone = (
  key: string,
  hour: number,
  minute: number,
  timeZone: string
): Date => {
  const [year, month, day] = key.split('-').map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let timestamp = wallClockUtc;

  // Two passes handle normal offsets; the third is a safety net for DST and
  // half-hour zones.
  for (let pass = 0; pass < 3; pass++) {
    const offset = zonedOffsetMs(new Date(timestamp), timeZone);
    const next = wallClockUtc - offset;
    if (next === timestamp) break;
    timestamp = next;
  }

  return new Date(timestamp);
};

/** The live device zone; Intl is not affected by Hermes's timezone cache. */
export const getDeviceTimeZone = (): string | null => {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) return null;
    // Validate that the ICU build can actually format with this zone before
    // the scheduler relies on it; otherwise fall back to the cached Date path.
    zonedFormatter(timeZone);
    return timeZone;
  } catch {
    return null;
  }
};

/**
 * Zone + offset signature. The offset changes on DST transitions and the zone
 * name changes on travel; either means the scheduled wall-clock time must be
 * rebuilt.
 */
export const getDeviceTimeZoneSignature = (date: Date = new Date()): string | null => {
  const timeZone = getDeviceTimeZone();
  if (!timeZone) return null;

  try {
    return `${timeZone}:${zonedOffsetMs(date, timeZone) / 60_000}`;
  } catch {
    return null;
  }
};

/**
 * True when `date` falls on a local calendar day after `now`'s day. Data entry
 * is limited to today and earlier, so future dates are view-only.
 */
export const isAfterToday = (date: Date, now: Date = new Date()): boolean =>
  formatDateKey(date) > formatDateKey(now);
