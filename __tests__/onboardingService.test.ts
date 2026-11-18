import AsyncStorage from '@react-native-async-storage/async-storage';
import { DataService } from '@/services/DataService';
import {
  OnboardingService,
  ONBOARDING_STORAGE_KEY,
  defaultOnboardingState,
  resolveOnboardingState,
} from '@/services/OnboardingService';

describe('resolveOnboardingState', () => {
  const state = defaultOnboardingState();

  it('shows welcome on a clean install', () => {
    expect(resolveOnboardingState(state, 0)).toEqual({
      status: 'welcome',
      pendingLastPeriod: false,
    });
  });

  it('treats existing history as onboarded', () => {
    expect(resolveOnboardingState(state, 3)).toEqual({
      status: 'app',
      pendingLastPeriod: false,
    });
  });

  it('resumes an in-progress last-period setup', () => {
    expect(resolveOnboardingState({ ...state, pendingLastPeriod: true }, 0)).toEqual({
      status: 'app',
      pendingLastPeriod: true,
    });
  });

  it('honours explicit completion', () => {
    expect(
      resolveOnboardingState({ ...state, completedAt: 123, method: 'skip' }, 0)
    ).toEqual({ status: 'app', pendingLastPeriod: false });
  });

  it('keeps the pending flag after completion when it was explicitly set', () => {
    expect(
      resolveOnboardingState(
        { ...state, completedAt: 123, method: 'skip', pendingLastPeriod: true },
        0
      )
    ).toEqual({ status: 'app', pendingLastPeriod: true });
  });
});

describe('OnboardingService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows welcome when nothing has been logged and nothing was completed', async () => {
    jest.spyOn(DataService, 'getTrackedDayCount').mockResolvedValue(0);

    await expect(OnboardingService.resolveFirstRun()).resolves.toEqual({
      status: 'welcome',
      pendingLastPeriod: false,
    });
  });

  it('auto-completes existing installs that already have tracked days', async () => {
    jest.spyOn(DataService, 'getTrackedDayCount').mockResolvedValue(4);

    await expect(OnboardingService.resolveFirstRun()).resolves.toEqual({
      status: 'app',
      pendingLastPeriod: false,
    });

    const state = await OnboardingService.getState();
    expect(state.completedAt).toEqual(expect.any(Number));
    expect(state.method).toBe('existing');
    expect(state.pendingLastPeriod).toBe(false);
  });

  it('persists skip so relaunch does not show welcome again', async () => {
    jest.spyOn(DataService, 'getTrackedDayCount').mockResolvedValue(0);

    await OnboardingService.markComplete('skip');

    await expect(OnboardingService.resolveFirstRun()).resolves.toEqual({
      status: 'app',
      pendingLastPeriod: false,
    });
  });

  it('persists and resumes the guided last-period mode', async () => {
    jest.spyOn(DataService, 'getTrackedDayCount').mockResolvedValue(0);

    await OnboardingService.beginLastPeriod();

    await expect(OnboardingService.getPendingLastPeriod()).resolves.toBe(true);
    await expect(OnboardingService.resolveFirstRun()).resolves.toEqual({
      status: 'app',
      pendingLastPeriod: true,
    });

    await OnboardingService.markComplete('last-period');

    await expect(OnboardingService.getPendingLastPeriod()).resolves.toBe(false);
    await expect(OnboardingService.resolveFirstRun()).resolves.toEqual({
      status: 'app',
      pendingLastPeriod: false,
    });
  });

  it('resets completion when data is cleared', async () => {
    jest.spyOn(DataService, 'getTrackedDayCount').mockResolvedValue(0);
    await OnboardingService.markComplete('skip');
    await OnboardingService.reset();

    await expect(OnboardingService.resolveFirstRun()).resolves.toEqual({
      status: 'welcome',
      pendingLastPeriod: false,
    });
  });

  it('falls back to a fresh state when the stored JSON is invalid', async () => {
    await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, '{not-json');
    jest.spyOn(DataService, 'getTrackedDayCount').mockResolvedValue(0);

    await expect(OnboardingService.getState()).resolves.toEqual(defaultOnboardingState());
    await expect(OnboardingService.resolveFirstRun()).resolves.toEqual({
      status: 'welcome',
      pendingLastPeriod: false,
    });
  });
});
