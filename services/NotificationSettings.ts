import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local notification preferences.
 *
 * Everything here is a *preference*; the actual reminders are scheduled on the
 * device by `NotificationService`. Keeping the shape and defaults in a pure
 * module makes the setup screen, the planner and the backup-free settings
 * storage easy to test without a native notifications module.
 */

export type NotificationPrivacy = 'discreet' | 'detailed';
export type NotificationTone = 'friendly' | 'girly' | 'formal';
export type LoggingCadence = 'daily' | 'weekly';
export type PeriodLeadDays = 1 | 2 | 3 | 5;

export interface NotificationSettings {
  /** True once the user has completed the setup screen. */
  configured: boolean;
  /** Master switch. Permission is requested when this turns on. */
  enabled: boolean;
  /** How much health detail appears on the lock screen. */
  privacy: NotificationPrivacy;
  /** Voice used for detailed notification copy. */
  tone: NotificationTone;
  periodReminder: boolean;
  periodLeadDays: PeriodLeadDays;
  lateCheckIn: boolean;
  fertileWindow: boolean;
  phaseTips: boolean;
  loggingReminder: boolean;
  loggingCadence: LoggingCadence;
  /** Local 24-hour time, `HH:mm`. */
  loggingTime: string;
  backupReminder: boolean;
  weeklySummary: boolean;
}

/**
 * Defaults after a fresh setup. Period, late-period and backup reminders are
 * the useful core; the more sensitive or noisy channels start off and are
 * explicitly opted into.
 */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  configured: false,
  enabled: false,
  privacy: 'discreet',
  tone: 'friendly',
  periodReminder: true,
  periodLeadDays: 2,
  lateCheckIn: true,
  fertileWindow: false,
  phaseTips: false,
  loggingReminder: false,
  loggingCadence: 'daily',
  loggingTime: '20:00',
  backupReminder: true,
  weeklySummary: false,
};

const STORAGE_KEY = 'notification_settings_v1';
const LEAD_DAY_OPTIONS: PeriodLeadDays[] = [1, 2, 3, 5];
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const boolOr = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const normalize = (value: unknown): NotificationSettings => {
  const parsed =
    value && typeof value === 'object' ? (value as Partial<NotificationSettings>) : {};

  const leadDays = LEAD_DAY_OPTIONS.includes(parsed.periodLeadDays as PeriodLeadDays)
    ? (parsed.periodLeadDays as PeriodLeadDays)
    : DEFAULT_NOTIFICATION_SETTINGS.periodLeadDays;

  return {
    configured: boolOr(parsed.configured, DEFAULT_NOTIFICATION_SETTINGS.configured),
    enabled: boolOr(parsed.enabled, DEFAULT_NOTIFICATION_SETTINGS.enabled),
    privacy: parsed.privacy === 'detailed' ? 'detailed' : 'discreet',
    tone:
      parsed.tone === 'girly' || parsed.tone === 'formal' ? parsed.tone : 'friendly',
    periodReminder: boolOr(
      parsed.periodReminder,
      DEFAULT_NOTIFICATION_SETTINGS.periodReminder
    ),
    periodLeadDays: leadDays,
    lateCheckIn: boolOr(parsed.lateCheckIn, DEFAULT_NOTIFICATION_SETTINGS.lateCheckIn),
    fertileWindow: boolOr(
      parsed.fertileWindow,
      DEFAULT_NOTIFICATION_SETTINGS.fertileWindow
    ),
    phaseTips: boolOr(parsed.phaseTips, DEFAULT_NOTIFICATION_SETTINGS.phaseTips),
    loggingReminder: boolOr(
      parsed.loggingReminder,
      DEFAULT_NOTIFICATION_SETTINGS.loggingReminder
    ),
    loggingCadence: parsed.loggingCadence === 'weekly' ? 'weekly' : 'daily',
    loggingTime:
      typeof parsed.loggingTime === 'string' && TIME_PATTERN.test(parsed.loggingTime)
        ? parsed.loggingTime
        : DEFAULT_NOTIFICATION_SETTINGS.loggingTime,
    backupReminder: boolOr(
      parsed.backupReminder,
      DEFAULT_NOTIFICATION_SETTINGS.backupReminder
    ),
    weeklySummary: boolOr(
      parsed.weeklySummary,
      DEFAULT_NOTIFICATION_SETTINGS.weeklySummary
    ),
  };
};

export class NotificationSettingsService {
  static async getSettings(): Promise<NotificationSettings> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_NOTIFICATION_SETTINGS };
      return normalize(JSON.parse(raw));
    } catch (error) {
      console.error('Error loading notification settings:', error);
      return { ...DEFAULT_NOTIFICATION_SETTINGS };
    }
  }

  static async saveSettings(settings: NotificationSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(settings)));
    } catch (error) {
      console.error('Error saving notification settings:', error);
      throw error;
    }
  }

  static async updateSettings(
    patch: Partial<NotificationSettings>
  ): Promise<NotificationSettings> {
    const current = await this.getSettings();
    const next = normalize({ ...current, ...patch });
    await this.saveSettings(next);
    return next;
  }

  static async reset(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Error resetting notification settings:', error);
    }
  }
}
