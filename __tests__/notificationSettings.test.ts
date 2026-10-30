import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettingsService,
} from '@/services/NotificationSettings';

const STORAGE_KEY = 'notification_settings_v1';

describe('NotificationSettingsService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('returns the defaults when nothing was saved', async () => {
    await expect(NotificationSettingsService.getSettings()).resolves.toEqual(
      DEFAULT_NOTIFICATION_SETTINGS
    );
  });

  it('saves and reloads a complete record', async () => {
    const settings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      configured: true,
      enabled: true,
      privacy: 'detailed' as const,
      tone: 'girly' as const,
      periodLeadDays: 5 as const,
      loggingCadence: 'weekly' as const,
      loggingTime: '18:00',
      phaseTips: true,
    };

    await NotificationSettingsService.saveSettings(settings);

    await expect(NotificationSettingsService.getSettings()).resolves.toEqual(settings);
  });

  it('merges partial updates into the saved record', async () => {
    const next = await NotificationSettingsService.updateSettings({
      configured: true,
      enabled: true,
      tone: 'formal',
    });

    expect(next.configured).toBe(true);
    expect(next.enabled).toBe(true);
    expect(next.tone).toBe('formal');
    expect(next.periodReminder).toBe(DEFAULT_NOTIFICATION_SETTINGS.periodReminder);
  });

  it('falls back to defaults for invalid JSON', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'not-json');
    await expect(NotificationSettingsService.getSettings()).resolves.toEqual(
      DEFAULT_NOTIFICATION_SETTINGS
    );
  });

  it('normalizes invalid field values instead of trusting them', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        configured: 'yes',
        enabled: true,
        privacy: 'loud',
        tone: 'shouty',
        periodLeadDays: 4,
        loggingCadence: 'often',
        loggingTime: '25:00',
      })
    );

    const settings = await NotificationSettingsService.getSettings();

    expect(settings.configured).toBe(false);
    expect(settings.enabled).toBe(true);
    expect(settings.privacy).toBe('discreet');
    expect(settings.tone).toBe('friendly');
    expect(settings.periodLeadDays).toBe(2);
    expect(settings.loggingCadence).toBe('daily');
    expect(settings.loggingTime).toBe('20:00');
  });

  it('resets back to defaults', async () => {
    await NotificationSettingsService.saveSettings({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      configured: true,
    });
    await NotificationSettingsService.reset();

    await expect(NotificationSettingsService.getSettings()).resolves.toEqual(
      DEFAULT_NOTIFICATION_SETTINGS
    );
  });
});
