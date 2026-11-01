import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import CalendarTab from '@/app/(tabs)/index';
import { ThemeProvider } from '@/hooks/useTheme';
import { DataService } from '@/services/DataService';

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
});
