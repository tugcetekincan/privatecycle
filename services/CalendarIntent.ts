/**
 * Typed, whitelisted intents for read-only tabs that hand off to Calendar.
 * The Calendar tab consumes each intent once and clears the route params, so a
 * tab refocus, back navigation or reload cannot reopen an entry sheet.
 */

export const CALENDAR_INTENTS = ['today', 'last-period', 'import'] as const;

export type CalendarIntent = (typeof CALENDAR_INTENTS)[number];

export interface CalendarIntentParams {
  calendarIntent: CalendarIntent;
  calendarIntentAt: string;
  [key: string]: string;
}

let intentSequence = 0;

const normalizeParam = (value: string | string[] | undefined | null): string | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

/** Accept only the three supported handoffs; everything else is ignored. */
export function parseCalendarIntent(
  value: string | string[] | undefined | null
): CalendarIntent | null {
  const normalized = normalizeParam(value);
  return normalized && (CALENDAR_INTENTS as readonly string[]).includes(normalized)
    ? (normalized as CalendarIntent)
    : null;
}

export function parseCalendarIntentNonce(
  value: string | string[] | undefined | null
): string | null {
  const normalized = normalizeParam(value);
  return normalized && normalized.length > 0 ? normalized : null;
}

/**
 * A fresh nonce makes a deliberate repeat tap distinct from the intent that
 * was already consumed.
 */
export function createCalendarIntentParams(intent: CalendarIntent): CalendarIntentParams {
  intentSequence += 1;
  return {
    calendarIntent: intent,
    calendarIntentAt: `${Date.now()}-${intentSequence}`,
  };
}

export function calendarIntentKey(intent: CalendarIntent, nonce: string): string {
  return `${intent}:${nonce}`;
}
