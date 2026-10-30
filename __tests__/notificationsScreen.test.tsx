import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NotificationsScreen from '@/app/notifications';
import { ThemeProvider } from '@/hooks/useTheme';
import { NotificationService } from '@/services/NotificationService';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettings,
} from '@/services/NotificationSettings';

// The setup screen loads preferences through AsyncStorage and animates on
// focus; CI's shared runners can take longer than Jest's 5s default for the
// first render.
jest.setTimeout(15000);

jest.mock('expo-router', () => {
  const ReactModule = require('react');
  return {
    useRouter: () => ({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      canGoBack: () => true,
    }),
    useFocusEffect: (callback: () => void) => {
      ReactModule.useEffect(callback, [callback]);
    },
  };
});

jest.mock('@/services/NotificationService', () => ({
  NotificationService: {
    getPermissionState: jest.fn(async () => 'granted'),
    requestPermission: jest.fn(async () => true),
    syncSchedule: jest.fn(async () => 0),
    sendTestNotification: jest.fn(async () => true),
    openSystemSettings: jest.fn(async () => undefined),
    webUnsupportedMessage: 'Notifications are available in the Android and iOS app.',
  },
}));

const mockedService = NotificationService as jest.Mocked<typeof NotificationService>;

const saveSettings = async (overrides: Partial<NotificationSettings> = {}) => {
  await AsyncStorage.setItem(
    'notification_settings_v1',
    JSON.stringify({ ...DEFAULT_NOTIFICATION_SETTINGS, ...overrides })
  );
};

const renderScreen = () =>
  render(
    <ThemeProvider>
      <NotificationsScreen />
    </ThemeProvider>
  );

describe('NotificationsScreen', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    (mockedService.getPermissionState as jest.Mock).mockResolvedValue('granted');
    (mockedService.requestPermission as jest.Mock).mockResolvedValue(true);
    (mockedService.sendTestNotification as jest.Mock).mockResolvedValue(true);
  });

  it('shows the setup flow with style, preview and reminder defaults', async () => {
    const screen = renderScreen();

    expect(await screen.findByText('Reminders that stay on your phone')).toBeTruthy();
    expect(screen.getByText('STYLE')).toBeTruthy();
    expect(screen.getByText('PREVIEW')).toBeTruthy();
    expect(screen.getByText('CYCLE REMINDERS')).toBeTruthy();
    expect(screen.getByText('ROUTINES')).toBeTruthy();
    expect(screen.getByTestId('notifications-enable')).toBeTruthy();
    expect(screen.getByText('A gentle check-in is ready when you are.')).toBeTruthy();
  });

  it('updates the preview when the privacy style changes', async () => {
    const screen = renderScreen();
    await screen.findByText('Reminders that stay on your phone');

    fireEvent.press(screen.getByTestId('notifications-privacy'));
    fireEvent.press(await screen.findByText('Detailed — show cycle words'));

    await waitFor(() => {
      expect(screen.getByText('Period predicted')).toBeTruthy();
    });
  });

  it('enables notifications and reveals the master switch', async () => {
    const screen = renderScreen();
    await screen.findByText('Reminders that stay on your phone');

    fireEvent.press(screen.getByTestId('notifications-enable'));

    await waitFor(() => {
      expect(screen.getByTestId('notifications-master-switch')).toBeTruthy();
    });
    expect(mockedService.requestPermission).toHaveBeenCalled();
    expect(mockedService.syncSchedule).toHaveBeenCalled();
  });

  it('shows the configured state and sends a test notification', async () => {
    await saveSettings({
      configured: true,
      enabled: true,
      privacy: 'detailed',
      tone: 'formal',
    });

    const screen = renderScreen();
    expect(await screen.findByText('Send test notification')).toBeTruthy();
    expect(screen.getByText('3 reminders on')).toBeTruthy();

    fireEvent.press(screen.getByTestId('notifications-test'));

    await waitFor(() => {
      expect(mockedService.sendTestNotification).toHaveBeenCalled();
    });
  });

  it('warns when the OS has blocked notifications', async () => {
    (mockedService.getPermissionState as jest.Mock).mockResolvedValue('denied');
    await saveSettings({ configured: true, enabled: true });

    const screen = renderScreen();

    expect(await screen.findByTestId('notifications-permission-warning')).toBeTruthy();
  });
});
