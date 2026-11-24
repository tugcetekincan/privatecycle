import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import CalendarTab from '@/app/(tabs)/index';
import { ThemeProvider } from '@/hooks/useTheme';
import { DataService } from '@/services/DataService';
import { OnboardingService } from '@/services/OnboardingService';
import { BackupService } from '@/services/BackupService';

// Mounting the calendar initializes the data provider before the welcome state
// renders; CI's shared runners can exceed Jest's 5s default on a cold start.
jest.setTimeout(15000);

const mockRouteParams: { current: Record<string, string | undefined> } = { current: {} };
const mockSetParams = jest.fn();
const mockFocusLifecycle: {
  callback: null | (() => void | (() => void));
  cleanup: null | (() => void);
} = { callback: null, cleanup: null };

const mockBlurCalendar = () => {
  const cleanup = mockFocusLifecycle.cleanup;
  mockFocusLifecycle.cleanup = null;
  cleanup?.();
};

const mockFocusCalendar = () => {
  const cleanup = mockFocusLifecycle.callback?.();
  mockFocusLifecycle.cleanup = typeof cleanup === 'function' ? cleanup : null;
};

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(() => {
      mockFocusLifecycle.callback = callback;
      const cleanup = callback();
      mockFocusLifecycle.cleanup =
        typeof cleanup === 'function' ? cleanup : null;
      return () => {
        if (mockFocusLifecycle.cleanup === cleanup) {
          mockFocusLifecycle.cleanup = null;
        }
        if (typeof cleanup === 'function') cleanup();
      };
    }, [callback]);
  },
  useLocalSearchParams: () => mockRouteParams.current,
  router: {
    setParams: (...args: unknown[]) => mockSetParams(...args),
    navigate: jest.fn(),
  },
}));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('@/services/NotificationService', () => ({ NotificationService: { syncSchedule: jest.fn() } }));
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

const renderCalendar = () => render(<ThemeProvider><CalendarTab /></ThemeProvider>);

describe('Calendar interactions', () => {
  beforeEach(() => {
    mockRouteParams.current = {};
    mockSetParams.mockClear();
    mockFocusLifecycle.callback = null;
    mockFocusLifecycle.cleanup = null;
  });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  it('navigates from January 31 to February rather than skipping to March', async () => {
    jest.useFakeTimers({ now: new Date(2026, 0, 31, 12) });
    const screen = renderCalendar();
    await screen.findByTestId('calendar-welcome');
    fireEvent.press(screen.getByTestId('calendar-next-month'));
    expect(screen.getByTestId('calendar-month-label').props.children.join('')).toBe('February 2026');
    fireEvent.press(screen.getByTestId('calendar-return-today'));
    expect(screen.getByTestId('calendar-month-label').props.children.join('')).toBe('January 2026');
  });

  it('acknowledges mood only after storage succeeds and queues rapid changes in order', async () => {
    let finish!: () => void;
    let finishLatest!: () => void;
    const save = jest.spyOn(DataService, 'saveMoodData')
      .mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }))
      .mockImplementationOnce(() => new Promise<void>(resolve => { finishLatest = resolve; }));
    const screen = renderCalendar();
    fireEvent.press(await screen.findByTestId('calendar-log-today'));
    fireEvent.press(screen.getByTestId('day-modal-mood-valence-4'));
    fireEvent.press(screen.getByTestId('day-modal-mood-valence-5'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('day-modal-mood-saved')).toBeNull();
    await act(async () => finish());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][1].moodValence).toBe(5);
    expect(screen.queryByTestId('day-modal-mood-saved')).toBeNull();
    await act(async () => finishLatest());
    expect(await screen.findByTestId('day-modal-mood-saved')).toBeTruthy();
  });

  it('keeps a failed entry open and retries the same selection', async () => {
    const save = jest.spyOn(DataService, 'saveTodayData')
      .mockRejectedValueOnce(new Error('Storage unavailable'))
      .mockResolvedValue(undefined);
    const screen = renderCalendar();
    fireEvent.press(await screen.findByTestId('calendar-log-today'));
    fireEvent.press(screen.getByTestId('day-modal-period-toggle'));
    fireEvent.press(screen.getByTestId('day-modal-save'));
    expect(await screen.findByText('Could not save this day. Please try again.')).toBeTruthy();
    expect(screen.getByTestId('day-modal-period-toggle').props.accessibilityState.checked).toBe(true);
    fireEvent.press(screen.getByTestId('day-modal-save'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][1].isPeriod).toBe(true);
  });

  it('guards unsaved period changes with three close actions', async () => {
    const save = jest.spyOn(DataService, 'saveTodayData').mockResolvedValue(undefined);
    const screen = renderCalendar();
    fireEvent.press(await screen.findByTestId('calendar-log-today'));

    fireEvent.press(screen.getByTestId('day-modal-period-toggle'));
    expect(await screen.findByTestId('day-modal-unsaved-status')).toBeTruthy();
    expect(screen.getByText('Unsaved changes · Period')).toBeTruthy();

    fireEvent.press(screen.getByTestId('day-modal-close'));
    expect(await screen.findByTestId('dialog')).toBeTruthy();
    expect(screen.getByText('Save changes before closing?')).toBeTruthy();
    expect(screen.getByText("Your period change hasn't been saved.")).toBeTruthy();
    expect(screen.getByTestId('dialog-button-save-close')).toBeTruthy();
    expect(screen.getByTestId('dialog-button-keep-editing')).toBeTruthy();
    expect(screen.getByTestId('dialog-button-discard-changes')).toBeTruthy();

    // onRequestClose/back while the inline guard is open behaves like Keep editing.
    fireEvent.press(screen.getByTestId('day-modal-close'));
    await waitFor(() => expect(screen.queryByTestId('dialog')).toBeNull());
    expect(screen.getByTestId('day-modal-save')).toBeTruthy();

    fireEvent.press(screen.getByTestId('day-modal-close'));
    fireEvent.press(await screen.findByTestId('dialog-button-keep-editing'));
    await waitFor(() => expect(screen.queryByTestId('dialog')).toBeNull());
    expect(screen.getByTestId('day-modal-save')).toBeTruthy();
    expect(screen.getByTestId('day-modal-period-toggle').props.accessibilityState.checked).toBe(true);

    fireEvent.press(screen.getByTestId('day-modal-close'));
    fireEvent.press(await screen.findByTestId('dialog-button-discard-changes'));
    await waitFor(() => expect(screen.queryByTestId('day-modal-save')).toBeNull());
    expect(save).not.toHaveBeenCalled();
  });

  it('does not prompt when the draft returns to its persisted baseline', async () => {
    const save = jest.spyOn(DataService, 'saveTodayData').mockResolvedValue(undefined);
    const screen = renderCalendar();
    fireEvent.press(await screen.findByTestId('calendar-log-today'));

    fireEvent.press(screen.getByTestId('day-modal-period-toggle'));
    fireEvent.press(screen.getByTestId('day-modal-period-toggle'));
    await waitFor(() => expect(screen.queryByTestId('day-modal-unsaved-status')).toBeNull());

    fireEvent.press(screen.getByTestId('day-modal-close'));
    await waitFor(() => expect(screen.queryByTestId('day-modal-save')).toBeNull());
    expect(screen.queryByTestId('dialog')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('saves and closes from the guard exactly once', async () => {
    const save = jest.spyOn(DataService, 'saveTodayData').mockResolvedValue(undefined);
    const screen = renderCalendar();
    fireEvent.press(await screen.findByTestId('calendar-log-today'));

    fireEvent.press(screen.getByTestId('day-modal-symptom-cramps'));
    fireEvent.press(screen.getByTestId('day-modal-close'));
    fireEvent.press(await screen.findByTestId('dialog-button-save-close'));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][1].symptoms).toContain('cramps');
    await waitFor(() => expect(screen.queryByTestId('day-modal-save')).toBeNull());
  });

  it('does not prompt for a mood that was already auto-saved', async () => {
    jest.spyOn(DataService, 'saveMoodData').mockResolvedValue(undefined);
    const saveDay = jest.spyOn(DataService, 'saveTodayData').mockResolvedValue(undefined);
    const screen = renderCalendar();
    fireEvent.press(await screen.findByTestId('calendar-log-today'));

    fireEvent.press(screen.getByTestId('day-modal-mood-valence-4'));
    expect(await screen.findByTestId('day-modal-mood-saved')).toBeTruthy();
    fireEvent.press(screen.getByTestId('day-modal-close'));

    await waitFor(() => expect(screen.queryByTestId('day-modal-save')).toBeNull());
    expect(screen.queryByTestId('dialog')).toBeNull();
    expect(saveDay).not.toHaveBeenCalled();
  });

  it('waits for a pending mood save before closing and then closes without prompting', async () => {
    let finish!: () => void;
    jest.spyOn(DataService, 'saveMoodData').mockImplementation(
      () => new Promise<void>(resolve => { finish = resolve; })
    );
    const saveDay = jest.spyOn(DataService, 'saveTodayData').mockResolvedValue(undefined);
    const screen = renderCalendar();
    fireEvent.press(await screen.findByTestId('calendar-log-today'));

    fireEvent.press(screen.getByTestId('day-modal-mood-valence-4'));
    expect(await screen.findByText('Mood saving…')).toBeTruthy();
    expect(screen.queryByTestId('day-modal-mood-saved')).toBeNull();

    fireEvent.press(screen.getByTestId('day-modal-close'));
    await act(async () => {});
    expect(screen.queryByTestId('dialog')).toBeNull();
    expect(screen.getByTestId('day-modal-save')).toBeTruthy();

    await act(async () => finish());
    await waitFor(() => expect(screen.queryByTestId('day-modal-save')).toBeNull());
    expect(screen.queryByTestId('dialog')).toBeNull();
    expect(saveDay).not.toHaveBeenCalled();
  });

  it('opens the guard after a pending mood fails while closing', async () => {
    let rejectMood!: (error: Error) => void;
    jest.spyOn(DataService, 'saveMoodData').mockImplementation(
      () => new Promise<void>((_resolve, reject) => { rejectMood = reject; })
    );
    const saveDay = jest.spyOn(DataService, 'saveTodayData').mockResolvedValue(undefined);
    const screen = renderCalendar();
    fireEvent.press(await screen.findByTestId('calendar-log-today'));

    fireEvent.press(screen.getByTestId('day-modal-mood-valence-4'));
    expect(await screen.findByText('Mood saving…')).toBeTruthy();
    fireEvent.press(screen.getByTestId('day-modal-close'));
    await act(async () => {});
    expect(screen.queryByTestId('dialog')).toBeNull();

    await act(async () => rejectMood(new Error('Storage unavailable')));
    expect(
      await screen.findByText(
        "Your mood change hasn't been saved. Discarding keeps your last saved mood."
      )
    ).toBeTruthy();
    expect(screen.getByTestId('day-modal-save')).toBeTruthy();
    expect(screen.getByTestId('day-modal-mood-valence-4').props.accessibilityState.selected).toBe(true);
    expect(saveDay).not.toHaveBeenCalled();
  });

  it('keeps the confirmed mood label after the transient Saved badge expires', async () => {
    jest.spyOn(DataService, 'saveMoodData').mockResolvedValue(undefined);
    const screen = renderCalendar();
    fireEvent.press(await screen.findByTestId('calendar-log-today'));

    fireEvent.press(screen.getByTestId('day-modal-mood-valence-4'));
    expect(await screen.findByTestId('day-modal-mood-saved')).toBeTruthy();

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 2100));
    });
    expect(screen.queryByTestId('day-modal-mood-saved')).toBeNull();

    fireEvent.press(screen.getByTestId('day-modal-period-toggle'));
    expect(await screen.findByText('Mood saved')).toBeTruthy();
    expect(screen.getByTestId('day-modal-mood-status').props.children).toBe('Mood saved');
  });

  it('shows Mood saved for an existing stored mood without a new write', async () => {
    const todayKey = DataService.formatDateKey(new Date());
    jest.spyOn(DataService, 'getAllDailyData').mockResolvedValue({
      [todayKey]: {
        date: todayKey,
        isPeriod: false,
        flowLevel: '',
        symptoms: [],
        mood: 'calm',
        isOvulation: false,
        moodValence: 4,
        moodTags: [{ id: 'calm', level: 1 }],
      },
    });
    mockRouteParams.current = { calendarIntent: 'today', calendarIntentAt: '1' };
    const saveDay = jest.spyOn(DataService, 'saveTodayData').mockResolvedValue(undefined);
    const screen = renderCalendar();

    await screen.findByTestId('day-modal-save');
    fireEvent.press(screen.getByTestId('day-modal-period-toggle'));
    expect(await screen.findByText('Mood saved')).toBeTruthy();
    expect(screen.getByTestId('day-modal-mood-status').props.children).toBe('Mood saved');

    fireEvent.press(screen.getByTestId('day-modal-close'));
    expect(await screen.findByText('Your mood is already saved.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('dialog-button-discard-changes'));
    await waitFor(() => expect(screen.queryByTestId('day-modal-save')).toBeNull());
    expect(saveDay).not.toHaveBeenCalled();
  });

  it('does not let a previous day’s queued mood overwrite the reopened day', async () => {
    const now = new Date();
    const todayKey = DataService.formatDateKey(now);
    const otherDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const otherKey = DataService.formatDateKey(otherDate);
    jest.spyOn(DataService, 'getAllDailyData').mockResolvedValue({
      [otherKey]: {
        date: otherKey,
        isPeriod: false,
        flowLevel: '',
        symptoms: [],
        mood: 'tired',
        isOvulation: false,
        moodValence: 3,
        moodTags: [{ id: 'tired', level: 1 }],
      },
    });
    let finish!: () => void;
    const saveMood = jest.spyOn(DataService, 'saveMoodData').mockImplementation(
      () => new Promise<void>(resolve => { finish = resolve; })
    );
    const screen = renderCalendar();
    await screen.findByTestId('calendar-log-today');
    if (otherDate.getMonth() !== now.getMonth()) {
      fireEvent.press(screen.getByTestId('calendar-prev-month'));
      await screen.findByTestId(`calendar-day-${otherKey}`);
    }
    fireEvent.press(screen.getByTestId('calendar-log-today'));

    fireEvent.press(screen.getByTestId('day-modal-mood-valence-5'));
    await waitFor(() => expect(saveMood).toHaveBeenCalledTimes(1));
    // Simulates a rapid reopen of another day before the queued write settles.
    fireEvent.press(screen.getByTestId(`calendar-day-${otherKey}`));
    expect(screen.getByTestId('day-modal-mood-valence-3').props.accessibilityState.selected).toBe(true);

    await act(async () => finish());
    fireEvent.press(screen.getByTestId('day-modal-period-toggle'));
    expect(await screen.findByText('Mood saved')).toBeTruthy();
    expect(screen.getByTestId('day-modal-mood-status').props.children).toBe('Mood saved');
  });

  it('retains a failed mood draft and saves it through the guard', async () => {
    jest.spyOn(DataService, 'saveMoodData').mockRejectedValueOnce(new Error('Storage unavailable'));
    const saveDay = jest.spyOn(DataService, 'saveTodayData').mockResolvedValue(undefined);
    const screen = renderCalendar();
    fireEvent.press(await screen.findByTestId('calendar-log-today'));

    fireEvent.press(screen.getByTestId('day-modal-mood-valence-4'));
    expect(
      await screen.findByText('Mood could not be saved. Tap Save day to try again.')
    ).toBeTruthy();
    expect(screen.getByText('Mood not saved')).toBeTruthy();
    expect(screen.getByTestId('day-modal-mood-valence-4').props.accessibilityState.selected).toBe(true);

    fireEvent.press(screen.getByTestId('day-modal-close'));
    expect(
      await screen.findByText(
        "Your mood change hasn't been saved. Discarding keeps your last saved mood."
      )
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId('dialog-button-save-close'));

    await waitFor(() => expect(saveDay).toHaveBeenCalledTimes(1));
    expect(saveDay.mock.calls[0][1].moodValence).toBe(4);
    await waitFor(() => expect(screen.queryByTestId('day-modal-save')).toBeNull());
  });

  it('blocks duplicate saves and closing while the write is in flight', async () => {
    let finish!: () => void;
    const save = jest.spyOn(DataService, 'saveTodayData').mockImplementation(
      () => new Promise<void>(resolve => { finish = resolve; })
    );
    const screen = renderCalendar();
    fireEvent.press(await screen.findByTestId('calendar-log-today'));

    fireEvent.press(screen.getByTestId('day-modal-period-toggle'));
    fireEvent.press(screen.getByTestId('day-modal-save'));
    fireEvent.press(screen.getByTestId('day-modal-save'));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('day-modal-close').props.accessibilityState.disabled).toBe(true)
    );
    expect(screen.getByText('Saving…')).toBeTruthy();

    await act(async () => finish());
    await waitFor(() => expect(screen.queryByTestId('day-modal-save')).toBeNull());
  });

  it('counts a guided last-period preset as an unsaved change', async () => {
    jest.spyOn(OnboardingService, 'getPendingLastPeriod').mockResolvedValue(true);
    const save = jest.spyOn(DataService, 'saveTodayData').mockResolvedValue(undefined);
    const screen = renderCalendar();

    await screen.findByTestId('calendar-first-run-banner');
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 1));
    const targetKey = DataService.formatDateKey(target);
    fireEvent.press(screen.getByTestId(`calendar-day-${targetKey}`));
    await screen.findByTestId('day-modal-first-run-hint');

    fireEvent.press(screen.getByTestId('day-modal-close'));
    expect(await screen.findByText("Your period change hasn't been saved.")).toBeTruthy();
    fireEvent.press(screen.getByTestId('dialog-button-discard-changes'));

    await waitFor(() => expect(screen.queryByTestId('day-modal-save')).toBeNull());
    expect(save).not.toHaveBeenCalled();
  });

  it('starts the guided last-period setup from the empty calendar', async () => {
    const begin = jest.spyOn(OnboardingService, 'beginLastPeriod').mockResolvedValue(undefined);
    const screen = renderCalendar();

    fireEvent.press(await screen.findByTestId('calendar-start-last-period'));

    await waitFor(() => expect(begin).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('calendar-first-run-banner')).toBeTruthy();
    expect(screen.queryByTestId('calendar-welcome')).toBeNull();
  });

  it('pre-sets Period and completes setup for a guided last-period day', async () => {
    jest.spyOn(OnboardingService, 'getPendingLastPeriod').mockResolvedValue(true);
    const complete = jest.spyOn(OnboardingService, 'markComplete').mockResolvedValue(undefined);
    const save = jest.spyOn(DataService, 'saveTodayData').mockResolvedValue(undefined);
    const screen = renderCalendar();

    await screen.findByTestId('calendar-first-run-banner');
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 1));
    const targetKey = DataService.formatDateKey(target);
    fireEvent.press(screen.getByTestId(`calendar-day-${targetKey}`));

    expect(await screen.findByTestId('day-modal-first-run-hint')).toBeTruthy();
    expect(screen.getByTestId('day-modal-period-toggle').props.accessibilityState.checked).toBe(true);

    fireEvent.press(screen.getByTestId('day-modal-save'));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(complete).toHaveBeenCalledWith('last-period'));
    await waitFor(() => expect(screen.queryByTestId('calendar-first-run-banner')).toBeNull());
  });

  it('keeps the guided banner when the saved day is not a period', async () => {
    jest.spyOn(OnboardingService, 'getPendingLastPeriod').mockResolvedValue(true);
    const complete = jest.spyOn(OnboardingService, 'markComplete').mockResolvedValue(undefined);
    const save = jest.spyOn(DataService, 'saveTodayData').mockResolvedValue(undefined);
    const screen = renderCalendar();

    await screen.findByTestId('calendar-first-run-banner');
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 1));
    const targetKey = DataService.formatDateKey(target);
    fireEvent.press(screen.getByTestId(`calendar-day-${targetKey}`));
    fireEvent.press(await screen.findByTestId('day-modal-period-toggle'));
    fireEvent.press(screen.getByTestId('day-modal-save'));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][1].isPeriod).toBe(false);
    expect(complete).not.toHaveBeenCalled();
    expect(await screen.findByTestId('calendar-first-run-banner')).toBeTruthy();
  });

  it('skips the guided setup from the banner', async () => {
    jest.spyOn(OnboardingService, 'getPendingLastPeriod').mockResolvedValue(true);
    const complete = jest.spyOn(OnboardingService, 'markComplete').mockResolvedValue(undefined);
    const screen = renderCalendar();

    await screen.findByTestId('calendar-first-run-banner');
    fireEvent.press(screen.getByTestId('calendar-first-run-cancel'));

    await waitFor(() => expect(complete).toHaveBeenCalledWith('skip'));
    expect(screen.queryByTestId('calendar-first-run-banner')).toBeNull();
  });

  it('opens today once from a route intent, stays closed when consumed, and opens again on a repeat tap', async () => {
    mockRouteParams.current = { calendarIntent: 'today', calendarIntentAt: '1' };
    const screen = renderCalendar();

    expect(await screen.findByTestId('day-modal-save')).toBeTruthy();
    expect(mockSetParams).toHaveBeenCalledWith({
      calendarIntent: undefined,
      calendarIntentAt: undefined,
    });

    fireEvent.press(screen.getByTestId('day-modal-close'));
    await waitFor(() => expect(screen.queryByTestId('day-modal-save')).toBeNull());

    // A refocus with the already-consumed params must not reopen the sheet.
    screen.rerender(<ThemeProvider><CalendarTab /></ThemeProvider>);
    await act(async () => {});
    expect(screen.queryByTestId('day-modal-save')).toBeNull();

    // A deliberate repeat sends a fresh nonce.
    mockRouteParams.current = { calendarIntent: 'today', calendarIntentAt: '2' };
    screen.rerender(<ThemeProvider><CalendarTab /></ThemeProvider>);
    expect(await screen.findByTestId('day-modal-save')).toBeTruthy();
  });

  it('opens today’s existing values from the partial mood action handoff', async () => {
    const todayKey = DataService.formatDateKey(new Date());
    jest.spyOn(DataService, 'getAllDailyData').mockResolvedValue({
      [todayKey]: {
        date: todayKey,
        isPeriod: false,
        flowLevel: '',
        symptoms: ['cramps'],
        mood: 'calm',
        isOvulation: false,
        moodValence: 4,
        moodTags: [{ id: 'calm', level: 2 }],
      },
    });
    mockRouteParams.current = { calendarIntent: 'today', calendarIntentAt: '1' };
    const screen = renderCalendar();

    await screen.findByTestId('day-modal-save');
    expect(
      screen.getByTestId('day-modal-mood-valence-4').props.accessibilityState.selected
    ).toBe(true);
    expect(
      screen.getByTestId('day-modal-mood-tag-calm').props.accessibilityState.selected
    ).toBe(true);
    expect(
      screen.getByTestId('day-modal-symptom-cramps').props.accessibilityState.checked
    ).toBe(true);
  });

  it('cancels a today intent when the tab blurs before the read settles', async () => {
    const resolvers: Array<
      (value: Awaited<ReturnType<typeof DataService.getPeriodData>>) => void
    > = [];
    jest.spyOn(DataService, 'getPeriodData').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );
    const settleReads = async () => {
      await act(async () => {
        while (resolvers.length > 0) {
          resolvers.shift()!({
            periods: [],
            ovulationDays: [],
            symptoms: {},
            moods: {},
          });
          await Promise.resolve();
        }
      });
    };

    mockRouteParams.current = { calendarIntent: 'today', calendarIntentAt: '1' };
    const screen = renderCalendar();
    await waitFor(() => expect(resolvers.length).toBeGreaterThan(0));

    mockBlurCalendar();
    await settleReads();
    expect(screen.queryByTestId('day-modal-save')).toBeNull();

    // Returning alone must not reopen the cancelled action.
    mockFocusCalendar();
    await waitFor(() => expect(resolvers.length).toBeGreaterThan(0));
    await settleReads();
    expect(screen.queryByTestId('day-modal-save')).toBeNull();

    // A deliberate new tap still opens exactly once.
    mockRouteParams.current = { calendarIntent: 'today', calendarIntentAt: '2' };
    screen.rerender(<ThemeProvider><CalendarTab /></ThemeProvider>);
    await waitFor(() => expect(resolvers.length).toBeGreaterThan(0));
    await settleReads();
    expect(await screen.findByTestId('day-modal-save')).toBeTruthy();
  });

  it('cancels an import intent on blur and does not show it on return', async () => {
    const resolvers: Array<
      (value: Awaited<ReturnType<typeof DataService.getPeriodData>>) => void
    > = [];
    jest.spyOn(DataService, 'getPeriodData').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );
    const importBackup = jest
      .spyOn(BackupService, 'importBackup')
      .mockResolvedValue({ cancelled: true } as any);
    const settleReads = async () => {
      await act(async () => {
        while (resolvers.length > 0) {
          resolvers.shift()!({
            periods: [],
            ovulationDays: [],
            symptoms: {},
            moods: {},
          });
          await Promise.resolve();
        }
      });
    };

    mockRouteParams.current = { calendarIntent: 'import', calendarIntentAt: '1' };
    const screen = renderCalendar();
    await waitFor(() => expect(resolvers.length).toBeGreaterThan(0));

    mockBlurCalendar();
    await settleReads();
    expect(screen.queryByTestId('dialog')).toBeNull();

    mockFocusCalendar();
    await waitFor(() => expect(resolvers.length).toBeGreaterThan(0));
    await settleReads();
    expect(screen.queryByTestId('dialog')).toBeNull();
    expect(importBackup).not.toHaveBeenCalled();

    mockRouteParams.current = { calendarIntent: 'import', calendarIntentAt: '2' };
    screen.rerender(<ThemeProvider><CalendarTab /></ThemeProvider>);
    await waitFor(() => expect(resolvers.length).toBeGreaterThan(0));
    await settleReads();
    expect(await screen.findByTestId('dialog')).toBeTruthy();
  });

  it('does not let an older focus read overwrite a newer one', async () => {
    const resolvers: Array<
      (value: Awaited<ReturnType<typeof DataService.getPeriodData>>) => void
    > = [];
    jest.spyOn(DataService, 'getPeriodData').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );
    const screen = renderCalendar();
    await waitFor(() => expect(resolvers.length).toBe(1));

    mockFocusCalendar();
    await waitFor(() => expect(resolvers.length).toBe(2));

    const todayKey = DataService.formatDateKey(new Date());
    await act(async () => {
      resolvers[1]({
        periods: [],
        ovulationDays: [],
        symptoms: {},
        moods: {},
      });
      await Promise.resolve();
    });
    await act(async () => {
      resolvers[0]({
        periods: [todayKey],
        ovulationDays: [],
        symptoms: {},
        moods: {},
      });
      await Promise.resolve();
    });

    expect(await screen.findByTestId('calendar-welcome')).toBeTruthy();
  });

  it('enters the existing last-period choose-date mode without opening a form', async () => {
    const begin = jest.spyOn(OnboardingService, 'beginLastPeriod').mockResolvedValue(undefined);
    mockRouteParams.current = { calendarIntent: 'last-period', calendarIntentAt: '1' };
    const screen = renderCalendar();

    expect(await screen.findByTestId('calendar-first-run-banner')).toBeTruthy();
    await waitFor(() => expect(begin).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('day-modal-save')).toBeNull();
  });

  it('hands an import intent to the existing confirmation and leaves data alone on cancel', async () => {
    const importBackup = jest.spyOn(BackupService, 'importBackup');
    mockRouteParams.current = { calendarIntent: 'import', calendarIntentAt: '1' };
    const screen = renderCalendar();

    await screen.findByTestId('dialog');
    fireEvent.press(screen.getByTestId('dialog-button-cancel'));

    await waitFor(() => expect(screen.queryByTestId('dialog')).toBeNull());
    expect(importBackup).not.toHaveBeenCalled();
    expect(await screen.findByTestId('calendar-log-today')).toBeTruthy();
  });
});
