import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

jest.mock('@/services/DataService', () => ({
  DataService: {
    getNotificationStats: jest.fn(),
    getTodayData: jest.fn(),
  },
}));

jest.mock('@/services/BackupService', () => ({
  BackupService: {
    getBackupSettings: jest.fn(),
  },
}));

import { BackupService } from '@/services/BackupService';
import { DataService } from '@/services/DataService';
import { NotificationService } from '@/services/NotificationService';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettings,
  NotificationSettingsService,
} from '@/services/NotificationSettings';
import { getDeviceTimeZone } from '@/services/dateKey';

const notifications = Notifications as jest.Mocked<typeof Notifications>;
const data = DataService as unknown as {
  getNotificationStats: jest.Mock;
  getTodayData: jest.Mock;
};
const backup = BackupService as unknown as {
  getBackupSettings: jest.Mock;
};

const settings = (): NotificationSettings => ({
  ...DEFAULT_NOTIFICATION_SETTINGS,
  configured: true,
  enabled: true,
  privacy: 'detailed',
  periodReminder: true,
  periodLeadDays: 2,
  lateCheckIn: false,
  fertileWindow: false,
  phaseTips: false,
  loggingReminder: false,
  backupReminder: false,
  weeklySummary: false,
});

describe('notification scheduling timezone', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-20T12:00:00Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    notifications.getPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    } as never);
    notifications.scheduleNotificationAsync.mockResolvedValue('test-notification');
    notifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
    data.getNotificationStats.mockResolvedValue({
      periodStarts: ['2026-09-01', '2026-09-29'],
      ovulationDays: [],
      trackedDays: 2,
    });
    data.getTodayData.mockResolvedValue(null);
    backup.getBackupSettings.mockResolvedValue({ lastBackupTime: null });
  });

  it('uses local calendar components in the live zone on iOS', async () => {
    const scheduled = await NotificationService.syncSchedule(settings());

    expect(scheduled).toBe(3);
    const request = notifications.scheduleNotificationAsync.mock.calls[0][0];
    const timeZone = getDeviceTimeZone() ?? 'UTC';

    if (Platform.OS === 'ios') {
      expect(request.trigger).toMatchObject({
        type: 'calendar',
        year: 2026,
        month: 10,
        day: 25,
        hour: 9,
        minute: 0,
        repeats: false,
      });
      expect((request.trigger as { timezone?: string }).timezone).toBe(timeZone);
    } else {
      expect(request.trigger).toMatchObject({
        type: 'date',
        channelId: 'cycle',
      });
    }
  });

  it('rebuilds when the live zone signature changes', async () => {
    await NotificationSettingsService.updateSettings(settings());
    await NotificationService.syncSchedule(settings());
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);

    // Same zone/offset: no redundant rebuild.
    await NotificationService.ensureTimeZoneSync();
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);

    // A changed zone/offset rebuilds from the persisted settings.
    await NotificationService.ensureTimeZoneSync('Test/Zone:999');
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(6);
  });
});
