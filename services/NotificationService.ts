import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { BackupService } from './BackupService';
import { DataService } from './DataService';
import {
  formatDateKey,
  getDateKeyInTimeZone,
  getDateTimeInTimeZone,
  getDeviceTimeZone,
  getDeviceTimeZoneSignature,
} from './dateKey';
import { previewNotificationCopy } from './NotificationCopy';
import {
  buildNotificationPlan,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_ID_PREFIX,
} from './NotificationPlanner';
import type { PlannedNotification } from './NotificationPlanner';
import {
  NotificationSettings,
  NotificationSettingsService,
} from './NotificationSettings';

/**
 * Local-only notification delivery.
 *
 * PrivateCycle has no backend and no push service: every reminder is scheduled
 * on the device with `expo-notifications` and rescheduled from the app's own
 * SQLite data. The private calendar is deliberately never read here.
 */

export type NotificationPermissionState =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unavailable';

export interface NotificationResponseTarget {
  id: string;
  url: string;
}

const WEB_UNSUPPORTED = 'Notifications are available in the Android and iOS app.';

const isGranted = (status: Notifications.NotificationPermissionsStatus): boolean =>
  status.granted ||
  status.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED ||
  status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

export class NotificationService {
  private static initPromise: Promise<void> | null = null;
  private static syncChain: Promise<number> = Promise.resolve(0);
  /** Live timezone + offset signature used by the last completed sync. */
  private static lastScheduledSignature: string | null = null;

  static get isSupported(): boolean {
    return Platform.OS !== 'web';
  }

  private static async initialize(): Promise<void> {
    if (!this.isSupported) return;
    if (!this.initPromise) {
      this.initPromise = this.performInitialize().catch((error) => {
        this.initPromise = null;
        throw error;
      });
    }
    return this.initPromise;
  }

  private static async performInitialize(): Promise<void> {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        // Android suppresses the heads-up banner when this is false, so keep
        // it true for the in-app test notification and rare foreground hits.
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    if (Platform.OS === 'android') {
      const channels: Array<{
        id: string;
        name: string;
        description: string;
        importance: Notifications.AndroidImportance;
        /** undefined = system default sound, null = silent. */
        sound?: string | null;
      }> = [
        {
          id: NOTIFICATION_CHANNELS.cycle,
          name: 'Cycle reminders',
          description: 'Predicted period, fertile window and phase notes',
          importance: Notifications.AndroidImportance.DEFAULT,
        },
        {
          id: NOTIFICATION_CHANNELS.logging,
          name: 'Logging reminders',
          description: 'Gentle prompts to record symptoms and mood',
          importance: Notifications.AndroidImportance.LOW,
          sound: null,
        },
        {
          id: NOTIFICATION_CHANNELS.backup,
          name: 'Backup reminders',
          description: 'Prompts to save a local backup',
          importance: Notifications.AndroidImportance.DEFAULT,
        },
        {
          id: NOTIFICATION_CHANNELS.insights,
          name: 'Weekly insights',
          description: 'Weekly summary and pattern reminders',
          importance: Notifications.AndroidImportance.LOW,
          sound: null,
        },
      ];

      for (const channel of channels) {
        try {
          await Notifications.setNotificationChannelAsync(channel.id, {
            name: channel.name,
            description: channel.description,
            importance: channel.importance,
            // Omitting `sound` selects the system default. Passing the string
            // 'default' makes expo-notifications look for a custom sound file.
            ...(channel.sound !== undefined ? { sound: channel.sound } : {}),
            // The copy itself is the privacy control: discreet text is neutral,
            // detailed text is an explicit opt-in. Public visibility keeps the
            // detailed mode honest on Android lock screens.
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            showBadge: false,
            enableVibrate: channel.importance !== Notifications.AndroidImportance.LOW,
          });
        } catch (error) {
          console.warn(`Could not create notification channel ${channel.id}:`, error);
        }
      }
    }
  }

  static async getPermissionState(): Promise<NotificationPermissionState> {
    if (!this.isSupported) return 'unavailable';

    try {
      const status = await Notifications.getPermissionsAsync();
      if (isGranted(status)) return 'granted';
      return status.status === 'denied' ? 'denied' : 'undetermined';
    } catch (error) {
      console.error('Error reading notification permission:', error);
      return 'unavailable';
    }
  }

  static async requestPermission(): Promise<boolean> {
    if (!this.isSupported) return false;

    try {
      await this.initialize();
      const current = await Notifications.getPermissionsAsync();
      if (isGranted(current)) return true;
      if (!current.canAskAgain) return false;

      const requested = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: false,
          allowSound: true,
        },
      });
      return isGranted(requested);
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  static async openSystemSettings(): Promise<void> {
    try {
      await Linking.openSettings();
    } catch (error) {
      console.error('Error opening system settings:', error);
    }
  }

  /**
   * Cancel and rebuild the scheduled set. Calls are serialized so a save made
   * while a sync is running cannot leave a stale schedule behind.
   */
  static syncSchedule(settings?: NotificationSettings): Promise<number> {
    this.syncChain = this.syncChain
      .catch(() => 0)
      .then(() => this.performSync(settings));
    return this.syncChain;
  }

  private static async performSync(
    settingsOverride?: NotificationSettings
  ): Promise<number> {
    if (!this.isSupported) return 0;

    try {
      await this.initialize();
      const settings =
        settingsOverride ?? (await NotificationSettingsService.getSettings());
      const signature = getDeviceTimeZoneSignature();
      const timeZone = getDeviceTimeZone() ?? undefined;

      if (!settings.configured || !settings.enabled) {
        await this.cancelAppNotifications();
        this.lastScheduledSignature = signature;
        return 0;
      }

      if ((await this.getPermissionState()) !== 'granted') {
        await this.cancelAppNotifications();
        this.lastScheduledSignature = signature;
        return 0;
      }

      const now = new Date();
      const todayKey = timeZone
        ? getDateKeyInTimeZone(now, timeZone)
        : formatDateKey(now);
      const [stats, todayData, backupSettings] = await Promise.all([
        DataService.getNotificationStats(),
        DataService.getTodayData(todayKey),
        BackupService.getBackupSettings(),
      ]);

      const plan = buildNotificationPlan({
        settings,
        now,
        timeZone,
        periodStarts: stats.periodStarts,
        ovulationDays: stats.ovulationDays,
        todayHasData: todayData !== null,
        lastBackupAt: backupSettings.lastBackupTime,
        trackedDays: stats.trackedDays,
      });

      await this.cancelAppNotifications();

      let scheduled = 0;
      for (const item of plan) {
        try {
          const quiet =
            item.kind === 'logging' || item.kind === 'weeklySummary';
          await Notifications.scheduleNotificationAsync({
            identifier: item.id,
            content: {
              title: item.title,
              body: item.body,
              data: item.data,
              sound: quiet ? false : true,
            },
            trigger: this.triggerFor(item, timeZone),
          });
          scheduled += 1;
        } catch (error) {
          console.warn(`Could not schedule notification ${item.id}:`, error);
        }
      }

      this.lastScheduledSignature = signature;
      return scheduled;
    } catch (error) {
      console.error('Error syncing notifications:', error);
      return 0;
    }
  }

  /**
   * iOS calendar triggers use local date components in the live zone, so DST
   * keeps the same wall-clock hour. Android has no one-off calendar trigger in
   * expo-notifications and uses an absolute DATE timestamp; the zone watcher
   * rebuilds it when the phone next runs.
   */
  private static triggerFor(
    item: PlannedNotification,
    timeZone?: string
  ): Notifications.NotificationTriggerInput {
    if (Platform.OS === 'ios') {
      const parts = timeZone
        ? getDateTimeInTimeZone(item.date, timeZone)
        : {
            year: item.date.getFullYear(),
            month: item.date.getMonth() + 1,
            day: item.date.getDate(),
            hour: item.date.getHours(),
            minute: item.date.getMinutes(),
          };

      return {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        ...(timeZone ? { timezone: timeZone } : {}),
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: parts.hour,
        minute: parts.minute,
        second: 0,
        repeats: false,
      };
    }

    return {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: item.date,
      channelId: item.channelId,
    };
  }

  /**
   * Rebuild when the live device zone or UTC offset changed since the last
   * sync. Hermes's cached Date zone is not used; Intl reflects a device
   * timezone change immediately. `signatureOverride` is a test seam.
   */
  static async ensureTimeZoneSync(signatureOverride?: string | null): Promise<void> {
    if (!this.isSupported) return;

    const signature =
      signatureOverride === undefined
        ? getDeviceTimeZoneSignature()
        : signatureOverride;
    if (!signature || signature === this.lastScheduledSignature) return;

    try {
      await this.syncSchedule();
    } catch (error) {
      console.error('Error rebuilding notifications after a timezone change:', error);
    }
  }

  private static async cancelAppNotifications(): Promise<void> {
    if (!this.isSupported) return;

    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(
        scheduled
          .filter((notification) =>
            notification.identifier.startsWith(NOTIFICATION_ID_PREFIX)
          )
          .map((notification) =>
            Notifications.cancelScheduledNotificationAsync(notification.identifier)
          )
      );
    } catch (error) {
      console.error('Error cancelling scheduled notifications:', error);
    }
  }

  static async sendTestNotification(settings: NotificationSettings): Promise<boolean> {
    if (!this.isSupported) return false;

    try {
      await this.initialize();
      if ((await this.getPermissionState()) !== 'granted') return false;

      const copy = previewNotificationCopy(settings);
      await Notifications.scheduleNotificationAsync({
        identifier: `${NOTIFICATION_ID_PREFIX}test-${Date.now()}`,
        content: {
          title: copy.title,
          body: copy.body,
          data: { url: '/(tabs)' },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 5,
          repeats: false,
          channelId: NOTIFICATION_CHANNELS.cycle,
        },
      });
      return true;
    } catch (error) {
      console.error('Error scheduling test notification:', error);
      return false;
    }
  }

  static addResponseListener(
    callback: (target: NotificationResponseTarget) => void
  ): () => void {
    if (!this.isSupported) return () => undefined;

    try {
      const subscription = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const url = response.notification.request.content.data?.url;
          if (typeof url === 'string') {
            callback({
              id: response.notification.request.identifier,
              url,
            });
          }
        }
      );
      return () => subscription.remove();
    } catch (error) {
      console.error('Error listening for notification responses:', error);
      return () => undefined;
    }
  }

  static async getLastResponse(): Promise<NotificationResponseTarget | null> {
    if (!this.isSupported) return null;

    try {
      const response = Notifications.getLastNotificationResponse();
      if (!response) return null;
      const url = response.notification.request.content.data?.url;
      if (typeof url !== 'string') return null;
      return {
        id: response.notification.request.identifier,
        url,
      };
    } catch (error) {
      console.error('Error reading last notification response:', error);
      return null;
    }
  }

  static get webUnsupportedMessage(): string {
    return WEB_UNSUPPORTED;
  }
}
