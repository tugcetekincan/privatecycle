import {
  calendarIntentKey,
  CALENDAR_INTENTS,
  createCalendarIntentParams,
  parseCalendarIntent,
  parseCalendarIntentNonce,
} from '@/services/CalendarIntent';

describe('calendar intents', () => {
  it('accepts only the whitelisted handoffs', () => {
    expect(CALENDAR_INTENTS).toEqual(['today', 'last-period', 'import']);

    for (const intent of CALENDAR_INTENTS) {
      expect(parseCalendarIntent(intent)).toBe(intent);
      expect(parseCalendarIntent([intent])).toBe(intent);
    }

    expect(parseCalendarIntent('settings')).toBeNull();
    expect(parseCalendarIntent('')).toBeNull();
    expect(parseCalendarIntent(undefined)).toBeNull();
    expect(parseCalendarIntent(['nope'])).toBeNull();
  });

  it('creates a distinct nonce for a deliberate repeat tap', () => {
    const first = createCalendarIntentParams('today');
    const second = createCalendarIntentParams('today');

    expect(first.calendarIntent).toBe('today');
    expect(first.calendarIntentAt).not.toBe(second.calendarIntentAt);
    expect(calendarIntentKey('today', first.calendarIntentAt)).not.toBe(
      calendarIntentKey('today', second.calendarIntentAt)
    );
  });

  it('treats an empty cleared nonce as absent', () => {
    expect(parseCalendarIntentNonce('')).toBeNull();
    expect(parseCalendarIntentNonce(undefined)).toBeNull();
    expect(parseCalendarIntentNonce(['123'])).toBe('123');
  });
});
