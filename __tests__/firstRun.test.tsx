import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import FirstRun from '@/components/onboarding/FirstRun';
import { ThemeProvider } from '@/hooks/useTheme';
import { BackupService } from '@/services/BackupService';

jest.setTimeout(15000);

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

const renderFirstRun = (overrides: Partial<React.ComponentProps<typeof FirstRun>> = {}) => {
  const props = {
    onStartLastPeriod: jest.fn(async () => undefined),
    onSkip: jest.fn(async () => undefined),
    onImported: jest.fn(async () => undefined),
    ...overrides,
  };
  const screen = render(
    <ThemeProvider>
      <FirstRun {...props} />
    </ThemeProvider>
  );
  return { screen, props };
};

const goToStep = (screen: ReturnType<typeof render>, step: 0 | 1 | 2) => {
  for (let current = 0; current < step; current += 1) {
    fireEvent.press(screen.getByTestId('first-run-next'));
  }
  expect(screen.getByTestId(`first-run-step-${step + 1}`)).toBeTruthy();
};

const resolveImport = async (screen: ReturnType<typeof render>) => {
  fireEvent.press(screen.getByTestId('first-run-import'));
  fireEvent.press(await screen.findByText('Import'));
};

describe('FirstRun', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('tells the Tidemark story across all three steps', () => {
    const { screen } = renderFirstRun();

    expect(screen.getByTestId('first-run-screen')).toBeTruthy();
    expect(screen.getByTestId('first-run-step-1')).toBeTruthy();
    expect(screen.getByText(/Find your/)).toBeTruthy();
    expect(screen.getByText(/Make room for the patterns that are yours/)).toBeTruthy();
    expect(screen.getByText(/Private by design/)).toBeTruthy();

    goToStep(screen, 1);
    expect(screen.getByText(/A small note/)).toBeTruthy();
    expect(screen.getByText('ILLUSTRATION')).toBeTruthy();
    expect(screen.getByText(/Start with the first day of your last period/)).toBeTruthy();
    expect(screen.getByText(/Forecasts are estimates/)).toBeTruthy();
    expect(screen.getByText(/not birth control or medical advice/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('first-run-next'));
    expect(screen.getByTestId('first-run-step-3')).toBeTruthy();
    expect(screen.getByText(/Yours means/)).toBeTruthy();
    expect(screen.getByText(/No account or cloud sync/)).toBeTruthy();
    expect(screen.getByText(/Keep an exported backup/)).toBeTruthy();
    expect(screen.getByText(/Reminders stay off until you choose/)).toBeTruthy();
  });

  it('moves forward and back through the three steps', () => {
    const { screen } = renderFirstRun();

    expect(screen.getByTestId('first-run-step-1')).toBeTruthy();
    expect(screen.queryByTestId('first-run-back')).toBeNull();

    fireEvent.press(screen.getByTestId('first-run-next'));
    expect(screen.getByTestId('first-run-step-2')).toBeTruthy();
    expect(screen.getByText(/A small note/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('first-run-next'));
    expect(screen.getByTestId('first-run-step-3')).toBeTruthy();
    expect(screen.getByText(/Yours means/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('first-run-back'));
    expect(screen.getByTestId('first-run-step-2')).toBeTruthy();

    fireEvent.press(screen.getByTestId('first-run-back'));
    expect(screen.getByTestId('first-run-step-1')).toBeTruthy();
  });

  it('keeps the illustrated calendar labelled and decorative', () => {
    const { screen } = renderFirstRun();
    goToStep(screen, 1);

    expect(screen.getByTestId('first-run-calendar-illustration')).toBeTruthy();
    expect(screen.getByText('ILLUSTRATION')).toBeTruthy();

    const decorative = screen.getByTestId('first-run-calendar-decorative', {
      includeHiddenElements: true,
    });
    expect(decorative.props.accessibilityElementsHidden).toBe(true);
    expect(decorative.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('offers Skip on every step without creating data', async () => {
    for (const step of [0, 1, 2] as const) {
      const { screen, props } = renderFirstRun();
      goToStep(screen, step);

      fireEvent.press(screen.getByTestId('first-run-skip'));

      await waitFor(() => expect(props.onSkip).toHaveBeenCalledTimes(1));
      expect(props.onStartLastPeriod).not.toHaveBeenCalled();
      expect(props.onImported).not.toHaveBeenCalled();
      screen.unmount();
    }
  });

  it('treats the unsure exit on step 3 as a skip', async () => {
    const { screen, props } = renderFirstRun();
    goToStep(screen, 2);

    fireEvent.press(screen.getByTestId('first-run-explore'));

    await waitFor(() => expect(props.onSkip).toHaveBeenCalledTimes(1));
    expect(props.onStartLastPeriod).not.toHaveBeenCalled();
  });

  it('starts the guided last-period setup only from step 3', async () => {
    const { screen, props } = renderFirstRun();

    expect(screen.queryByTestId('first-run-start-period')).toBeNull();
    goToStep(screen, 2);

    fireEvent.press(screen.getByTestId('first-run-start-period'));

    await waitFor(() => expect(props.onStartLastPeriod).toHaveBeenCalledTimes(1));
  });

  it('keeps the screen open when the import picker is cancelled', async () => {
    const { screen, props } = renderFirstRun();
    goToStep(screen, 2);
    jest.spyOn(BackupService, 'importBackup').mockResolvedValue({
      success: false,
      cancelled: true,
      message: 'Import cancelled',
    });

    await resolveImport(screen);

    await waitFor(() => expect(BackupService.importBackup).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('first-run-import').props.accessibilityState.busy).toBe(false)
    );
    expect(props.onImported).not.toHaveBeenCalled();
    expect(screen.getByTestId('first-run-step-3')).toBeTruthy();
  });

  it('hands off to the calendar after a successful import', async () => {
    const { screen, props } = renderFirstRun();
    goToStep(screen, 2);
    jest.spyOn(BackupService, 'importBackup').mockResolvedValue({
      success: true,
      message: 'Successfully imported backup with 2 days of data',
      stats: {
        version: '1.0.0',
        timestamp: 'Nov 18, 2026',
        totalDays: 2,
        includesPrivateData: false,
      },
    });

    await resolveImport(screen);

    expect(await screen.findByText('Backup imported')).toBeTruthy();
    expect(props.onImported).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTestId('first-run-import').props.accessibilityState.busy).toBe(false)
    );

    fireEvent.press(screen.getByText('OK'));

    await waitFor(() => expect(props.onImported).toHaveBeenCalledTimes(1));
  });

  it('shows an error on step 3 when the import fails', async () => {
    const { screen, props } = renderFirstRun();
    goToStep(screen, 2);
    jest.spyOn(BackupService, 'importBackup').mockResolvedValue({
      success: false,
      message: 'Invalid backup file format',
    });

    await resolveImport(screen);

    expect(await screen.findByText('Import Failed')).toBeTruthy();
    expect(screen.getByText('Invalid backup file format')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('first-run-import').props.accessibilityState.busy).toBe(false)
    );
    expect(props.onImported).not.toHaveBeenCalled();
    expect(screen.getByTestId('first-run-step-3')).toBeTruthy();
  });

  it('shows an error when the setup state cannot be saved', async () => {
    const onStartLastPeriod = jest.fn(async () => {
      throw new Error('Storage unavailable');
    });
    const { screen } = renderFirstRun({ onStartLastPeriod });
    goToStep(screen, 2);

    fireEvent.press(screen.getByTestId('first-run-start-period'));

    expect(await screen.findByText('Could not start setup')).toBeTruthy();
    expect(screen.getByTestId('first-run-step-3')).toBeTruthy();
  });
});
