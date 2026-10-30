/**
 * Local-time day keys shared by the data layer and the forecast math.
 *
 * A day key is `YYYY-MM-DD` for the device's local calendar day. Never build
 * keys with `toISOString()` — it converts to UTC first and shifts the date in
 * negative-offset timezones (see AGENTS.md).
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

/**
 * True when `date` falls on a local calendar day after `now`'s day. Data entry
 * is limited to today and earlier, so future dates are view-only.
 */
export const isAfterToday = (date: Date, now: Date = new Date()): boolean =>
  formatDateKey(date) > formatDateKey(now);
