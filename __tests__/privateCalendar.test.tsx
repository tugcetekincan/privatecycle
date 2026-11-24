import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import PrivateCalendar from '@/components/PrivateCalendar';
import { ThemeProvider } from '@/hooks/useTheme';
import { DataService } from '@/services/DataService';

jest.setTimeout(15000);

jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  useRouter: () => ({
    canGoBack: () => true,
    back: jest.fn(),
    replace: jest.fn(),
  }),
}));
jest.mock('@/components/PrivateGate', () => ({
  usePrivateGate: () => ({ lock: jest.fn() }),
}));
jest.mock('@/hooks/usePrivateScreenProtection', () => ({
  usePrivateScreenProtection: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const ReactNative = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) =>
      React.createElement(ReactNative.View, props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('@/components/ui/Sheet', () => ({
  __esModule: true,
  default: ({ visible, children, footer, closeTestID, onClose, dialog, busy, testID }: any) => {
    if (!visible) return null;
    const React = require('react');
    const ReactNative = require('react-native');
    return React.createElement(
      ReactNative.View,
      { testID },
      children,
      footer,
      dialog,
      React.createElement(ReactNative.TouchableOpacity, {
        testID: closeTestID,
        onPress: onClose,
        disabled: busy,
      })
    );
  },
}));

const todayKey = DataService.formatDateKey(new Date());

const renderPrivateCalendar = () =>
  render(
    <ThemeProvider>
      <PrivateCalendar />
    </ThemeProvider>
  );

const openToday = async (screen: ReturnType<typeof renderPrivateCalendar>) => {
  await screen.findByTestId(`private-day-${todayKey}`);
  fireEvent.press(screen.getByTestId(`private-day-${todayKey}`));
  await screen.findByTestId('private-day-modal');
};

describe('Private calendar day sheet', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lists actual unsaved groups and guards closing with three actions', async () => {
    jest.spyOn(DataService, 'getIntimateData').mockResolvedValue({});
    const save = jest.spyOn(DataService, 'saveIntimateDay').mockResolvedValue(undefined);
    const remove = jest.spyOn(DataService, 'deleteIntimateDay').mockResolvedValue(undefined);
    const screen = renderPrivateCalendar();
    await openToday(screen);

    fireEvent(screen.getByTestId('private-day-activity'), 'valueChange', true);
    fireEvent.changeText(screen.getByTestId('private-note-input'), 'sensitive detail');
    expect(await screen.findByText('Unsaved changes · Activity and Note')).toBeTruthy();

    fireEvent.press(screen.getByTestId('private-day-close'));
    expect(await screen.findByTestId('dialog')).toBeTruthy();
    expect(screen.getByText('Save changes before closing?')).toBeTruthy();
    const message = screen.getByTestId('dialog-message').props.children;
    expect(message).toBe("Your activity and note changes haven't been saved.");
    expect(String(message)).not.toContain('sensitive detail');
    expect(screen.getByTestId('dialog-button-save-close')).toBeTruthy();
    expect(screen.getByTestId('dialog-button-keep-editing')).toBeTruthy();
    expect(screen.getByTestId('dialog-button-discard-changes')).toBeTruthy();

    fireEvent.press(screen.getByTestId('dialog-button-keep-editing'));
    await waitFor(() => expect(screen.queryByTestId('dialog')).toBeNull());
    expect(screen.getByTestId('private-day-modal')).toBeTruthy();

    fireEvent.press(screen.getByTestId('private-day-close'));
    fireEvent.press(await screen.findByTestId('dialog-button-discard-changes'));
    await waitFor(() => expect(screen.queryByTestId('private-day-modal')).toBeNull());
    expect(save).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('does not prompt when trimmed note or protection return to their stored meaning', async () => {
    jest.spyOn(DataService, 'getIntimateData').mockResolvedValue({
      [todayKey]: { date: todayKey, protection: 'protected', note: 'stored note' },
    });
    const save = jest.spyOn(DataService, 'saveIntimateDay').mockResolvedValue(undefined);
    const screen = renderPrivateCalendar();
    await openToday(screen);

    fireEvent.changeText(screen.getByTestId('private-note-input'), '  stored note  ');
    expect(screen.queryByTestId('private-day-unsaved-status')).toBeNull();

    fireEvent.press(screen.getByTestId('private-protection-unprotected'));
    expect(await screen.findByText('Unsaved changes · Protection')).toBeTruthy();
    fireEvent.press(screen.getByTestId('private-protection-protected'));
    await waitFor(() => expect(screen.queryByTestId('private-day-unsaved-status')).toBeNull());

    fireEvent.press(screen.getByTestId('private-day-close'));
    await waitFor(() => expect(screen.queryByTestId('private-day-modal')).toBeNull());
    expect(screen.queryByTestId('dialog')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('treats turning activity off on an existing day as an unsaved removal', async () => {
    jest.spyOn(DataService, 'getIntimateData').mockResolvedValue({
      [todayKey]: { date: todayKey, protection: 'protected', note: 'stored note' },
    });
    const save = jest.spyOn(DataService, 'saveIntimateDay').mockResolvedValue(undefined);
    const remove = jest.spyOn(DataService, 'deleteIntimateDay').mockResolvedValue(undefined);
    const screen = renderPrivateCalendar();
    await openToday(screen);

    fireEvent(screen.getByTestId('private-day-activity'), 'valueChange', false);
    expect(
      await screen.findByText('Unsaved changes · Activity, Protection and Note')
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('private-day-close'));
    expect(await screen.findByText('Your activity, protection and note changes haven\'t been saved.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('dialog-button-discard-changes'));
    await waitFor(() => expect(screen.queryByTestId('private-day-modal')).toBeNull());
    expect(remove).not.toHaveBeenCalled();

    await openToday(screen);
    fireEvent(screen.getByTestId('private-day-activity'), 'valueChange', false);
    fireEvent.press(screen.getByTestId('private-day-close'));
    fireEvent.press(await screen.findByTestId('dialog-button-save-close'));

    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(save).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('private-day-modal')).toBeNull());
  });

  it('saves the trimmed draft from Save & close', async () => {
    jest.spyOn(DataService, 'getIntimateData').mockResolvedValue({});
    const save = jest.spyOn(DataService, 'saveIntimateDay').mockResolvedValue(undefined);
    const screen = renderPrivateCalendar();
    await openToday(screen);

    fireEvent(screen.getByTestId('private-day-activity'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('private-protection-protected'));
    fireEvent.changeText(screen.getByTestId('private-note-input'), '  private draft  ');
    fireEvent.press(screen.getByTestId('private-day-close'));
    fireEvent.press(await screen.findByTestId('dialog-button-save-close'));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatchObject({
      date: todayKey,
      protection: 'protected',
      note: 'private draft',
    });
    await waitFor(() => expect(screen.queryByTestId('private-day-modal')).toBeNull());
  });

  it('keeps the draft after a failed save and retries it', async () => {
    jest.spyOn(DataService, 'getIntimateData').mockResolvedValue({});
    const save = jest.spyOn(DataService, 'saveIntimateDay')
      .mockRejectedValueOnce(new Error('Storage unavailable'))
      .mockResolvedValue(undefined);
    const screen = renderPrivateCalendar();
    await openToday(screen);

    fireEvent(screen.getByTestId('private-day-activity'), 'valueChange', true);
    fireEvent.changeText(screen.getByTestId('private-note-input'), 'retry me');
    fireEvent.press(screen.getByTestId('private-day-save'));

    expect(await screen.findByText('Could not save this entry. Please try again.')).toBeTruthy();
    expect(screen.getByTestId('private-day-modal')).toBeTruthy();
    expect(screen.getByTestId('private-note-input').props.value).toBe('retry me');

    fireEvent.press(screen.getByTestId('private-day-save'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0].note).toBe('retry me');
    await waitFor(() => expect(screen.queryByTestId('private-day-modal')).toBeNull());
  });

  it('blocks duplicate submissions and closing while saving', async () => {
    jest.spyOn(DataService, 'getIntimateData').mockResolvedValue({});
    let finish!: () => void;
    const save = jest.spyOn(DataService, 'saveIntimateDay').mockImplementation(
      () => new Promise<void>(resolve => { finish = resolve; })
    );
    const screen = renderPrivateCalendar();
    await openToday(screen);

    fireEvent(screen.getByTestId('private-day-activity'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('private-day-save'));
    fireEvent.press(screen.getByTestId('private-day-save'));

    expect(save).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByTestId('private-day-close').props.accessibilityState.disabled).toBe(true)
    );
    expect(screen.getByText('Saving…')).toBeTruthy();

    await act(async () => finish());
    await waitFor(() => expect(screen.queryByTestId('private-day-modal')).toBeNull());
  });

  it('uses the same busy exclusion while a deletion is pending', async () => {
    jest.spyOn(DataService, 'getIntimateData').mockResolvedValue({
      [todayKey]: { date: todayKey, protection: 'protected', note: 'stored note' },
    });
    let finish!: () => void;
    const remove = jest.spyOn(DataService, 'deleteIntimateDay').mockImplementation(
      () => new Promise<void>(resolve => { finish = resolve; })
    );
    const save = jest.spyOn(DataService, 'saveIntimateDay').mockResolvedValue(undefined);
    const screen = renderPrivateCalendar();
    await openToday(screen);

    fireEvent.press(screen.getByTestId('private-day-delete'));
    fireEvent.press(await screen.findByTestId('dialog-button-delete'));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('private-day-close').props.accessibilityState.disabled).toBe(true)
    );
    expect(screen.getByText('Saving…')).toBeTruthy();

    fireEvent(screen.getByTestId('private-day-activity'), 'valueChange', false);
    fireEvent.press(screen.getByTestId('private-day-save'));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByTestId('private-day-activity').props.value).toBe(true);

    await act(async () => finish());
    await waitFor(() => expect(screen.queryByTestId('private-day-modal')).toBeNull());
  });

  it('retains the draft when a deletion fails', async () => {
    jest.spyOn(DataService, 'getIntimateData').mockResolvedValue({
      [todayKey]: { date: todayKey, protection: 'protected', note: 'stored note' },
    });
    jest.spyOn(DataService, 'deleteIntimateDay').mockRejectedValueOnce(
      new Error('Storage unavailable')
    );
    const screen = renderPrivateCalendar();
    await openToday(screen);

    fireEvent.press(screen.getByTestId('private-day-delete'));
    fireEvent.press(await screen.findByTestId('dialog-button-delete'));

    expect(await screen.findByText('Could not delete this entry. Please try again.')).toBeTruthy();
    expect(screen.getByTestId('private-day-modal')).toBeTruthy();
    expect(screen.getByTestId('private-note-input').props.value).toBe('stored note');
    expect(screen.getByTestId('private-day-activity').props.value).toBe(true);
    expect(screen.getByTestId('private-day-save').props.accessibilityState.disabled).toBe(false);
  });
});
