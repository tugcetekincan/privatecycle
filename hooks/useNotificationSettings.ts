import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettings,
  NotificationSettingsService,
} from '@/services/NotificationSettings';

/**
 * Shared loader for notification preferences. The settings tab only needs a
 * summary; the notifications screen edits the same record.
 */
export function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS
  );
  const [loading, setLoading] = useState(true);
  const updateChain = useRef<Promise<unknown>>(Promise.resolve());

  const refresh = useCallback(async (): Promise<NotificationSettings> => {
    await updateChain.current.catch(() => undefined);
    const loaded = await NotificationSettingsService.getSettings();
    setSettings(loaded);
    setLoading(false);
    return loaded;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const update = useCallback(
    async (patch: Partial<NotificationSettings>): Promise<NotificationSettings> => {
      // Serialize writes so two fast switch taps cannot read the same old
      // record and overwrite each other.
      const next = updateChain.current
        .catch(() => undefined)
        .then(() => NotificationSettingsService.updateSettings(patch))
        .then((result) => {
          setSettings(result);
          return result;
        });
      updateChain.current = next;
      return next;
    },
    []
  );

  return { settings, loading, refresh, update };
}
