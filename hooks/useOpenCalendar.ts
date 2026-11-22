import { useCallback } from 'react';
import { router } from 'expo-router';
import {
  CalendarIntent,
  createCalendarIntentParams,
} from '@/services/CalendarIntent';

/**
 * Navigate from a read-only tab to Calendar. With an intent, Calendar consumes
 * it once and opens the existing entry, last-period or import flow after its
 * data is loaded. Without one it only switches tabs.
 */
export function useOpenCalendar() {
  return useCallback((intent?: CalendarIntent) => {
    if (!intent) {
      router.navigate('/');
      return;
    }
    router.navigate({
      pathname: '/',
      params: createCalendarIntentParams(intent),
    });
  }, []);
}
