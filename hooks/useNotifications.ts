import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, type Href } from 'expo-router';
import { NotificationService } from '@/services/NotificationService';

let initialResponseChecked = false;
const handledResponseIds = new Set<string>();
const HANDLED_RESPONSE_KEY = 'notifications_last_handled_response';

/**
 * Owns the app-wide notification lifecycle: reschedule on launch/foreground and
 * route a notification tap into the tab it belongs to. Mounted once by the root
 * layout; web is a no-op.
 */
export function useNotifications(ready: boolean) {
  const router = useRouter();

  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;

    let mounted = true;
    let lastSync = 0;

    const sync = () => {
      const now = Date.now();
      if (now - lastSync < 60_000) return;
      lastSync = now;
      void NotificationService.syncSchedule();
    };

    sync();

    // Hermes's cached Date timezone does not update when the phone changes
    // zones, but Intl does. Notice a live zone/offset change while the app is
    // open and rebuild; foreground sync covers changes made while it was
    // closed.
    const timeZoneInterval = setInterval(() => {
      void NotificationService.ensureTimeZoneSync();
    }, 60_000);

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        sync();
        // The throttled sync may skip a change made while the app was
        // backgrounded; the live signature check catches it immediately.
        void NotificationService.ensureTimeZoneSync();
      }
    });

    const handleTarget = async (target: { id: string; url: string }) => {
      if (handledResponseIds.has(target.id)) return;
      handledResponseIds.add(target.id);

      try {
        const lastHandled = await AsyncStorage.getItem(HANDLED_RESPONSE_KEY);
        if (lastHandled === target.id) return;
        await AsyncStorage.setItem(HANDLED_RESPONSE_KEY, target.id);
      } catch {
        // Navigation is more useful than a failed preference read/write.
      }

      if (mounted) router.push(target.url as Href);
    };

    const unsubscribe = NotificationService.addResponseListener((target) => {
      void handleTarget(target);
    });

    if (!initialResponseChecked) {
      initialResponseChecked = true;
      void NotificationService.getLastResponse().then((target) => {
        if (target) void handleTarget(target);
      });
    }

    return () => {
      mounted = false;
      clearInterval(timeZoneInterval);
      appStateSubscription.remove();
      unsubscribe();
    };
  }, [ready, router]);
}
