import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import CalendarTab from '@/app/(tabs)/index';
import { ThemeProvider } from '@/hooks/useTheme';
import { DataService } from '@/services/DataService';
import { OnboardingService } from '@/services/OnboardingService';

// Mounting the calendar initializes the data provider before the welcome state
// renders; CI's shared runners can exceed Jest's 5s default on a cold start.
jest.setTimeout(15000);

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('@/services/NotificationService', () => ({ NotificationService: { syncSchedule: jest.fn() } }));
jest.mock('@/components/ui/Sheet', () => ({
  __esModule: true,
  default: ({ visible, children, footer }: any) => visible
    ? require('react').createElement(require('react-native').View, null, children, footer)
    : null,
}));

const renderCalendar = () => render(<ThemeProvider><CalendarTab /></ThemeProvider>);

describe('Calendar interactions', () => {
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
});
