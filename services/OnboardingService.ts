import AsyncStorage from '@react-native-async-storage/async-storage';
import { DataService } from './DataService';

/**
 * Device-local first-run state.
 *
 * This is a preference, not health data: it never belongs in backups. The
 * state is deliberately small so the root gate can decide whether to show the
 * welcome screen before the tabs render. Data presence is the safety net for
 * existing installs: if a user upgrades with rows in `daily_data` and no
 * onboarding key, they are silently treated as onboarded.
 */

export const ONBOARDING_STORAGE_KEY = 'onboarding_v1';

export type OnboardingMethod = 'last-period' | 'import' | 'skip' | 'existing';
export type FirstRunStatus = 'welcome' | 'app';

export interface OnboardingState {
  version: 1;
  completedAt: number | null;
  method: OnboardingMethod | null;
  pendingLastPeriod: boolean;
}

export interface FirstRunResolution {
  status: FirstRunStatus;
  pendingLastPeriod: boolean;
}

const METHODS: readonly OnboardingMethod[] = ['last-period', 'import', 'skip', 'existing'];

export const defaultOnboardingState = (): OnboardingState => ({
  version: 1,
  completedAt: null,
  method: null,
  pendingLastPeriod: false,
});

const normalizeState = (value: unknown): OnboardingState => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return defaultOnboardingState();
  }

  const raw = value as Record<string, unknown>;
  const completedAt =
    typeof raw.completedAt === 'number' && Number.isFinite(raw.completedAt) && raw.completedAt > 0
      ? raw.completedAt
      : null;
  const method =
    typeof raw.method === 'string' && (METHODS as readonly string[]).includes(raw.method)
      ? (raw.method as OnboardingMethod)
      : null;

  return {
    version: 1,
    completedAt,
    method: completedAt ? method : null,
    pendingLastPeriod: raw.pendingLastPeriod === true,
  };
};

/**
 * Pure resolution used by the service and tests.
 *
 * Precedence matters: an explicit completion wins, then an in-progress
 * last-period setup (so a relaunch resumes the calendar banner), then any
 * existing history (existing installs skip onboarding), then welcome.
 */
export function resolveOnboardingState(
  state: OnboardingState,
  trackedDays: number
): FirstRunResolution {
  if (state.completedAt) {
    return { status: 'app', pendingLastPeriod: state.pendingLastPeriod };
  }
  if (state.pendingLastPeriod) {
    return { status: 'app', pendingLastPeriod: true };
  }
  if (trackedDays > 0) {
    return { status: 'app', pendingLastPeriod: false };
  }
  return { status: 'welcome', pendingLastPeriod: false };
}

class OnboardingServiceClass {
  async getState(): Promise<OnboardingState> {
    try {
      const raw = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
      if (!raw) return defaultOnboardingState();
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      console.error('Error reading onboarding state:', error);
      return defaultOnboardingState();
    }
  }

  private async saveState(state: OnboardingState): Promise<void> {
    await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  }

  /**
   * Resolve once per launch, after migrations and the dev-seed gate. An
   * unexpected resolution error fails open (app, no welcome) so a broken
   * preference cannot block the calendar; a normal read error falls back to
   * the default state, which remains skippable.
   */
  async resolveFirstRun(): Promise<FirstRunResolution> {
    try {
      const state = await this.getState();
      const trackedDays =
        state.completedAt || state.pendingLastPeriod
          ? 0
          : await DataService.getTrackedDayCount();
      const resolution = resolveOnboardingState(state, trackedDays);

      if (
        resolution.status === 'app' &&
        !state.completedAt &&
        !state.pendingLastPeriod &&
        trackedDays > 0
      ) {
        await this.saveState({
          ...state,
          completedAt: Date.now(),
          method: 'existing',
          pendingLastPeriod: false,
        });
      }

      return resolution;
    } catch (error) {
      console.error('Error resolving first-run state:', error);
      return { status: 'app', pendingLastPeriod: false };
    }
  }

  /** Enter the guided “tap the first day of your last period” calendar mode. */
  async beginLastPeriod(): Promise<void> {
    const state = await this.getState();
    await this.saveState({ ...state, pendingLastPeriod: true });
  }

  async getPendingLastPeriod(): Promise<boolean> {
    try {
      return (await this.getState()).pendingLastPeriod;
    } catch (error) {
      console.error('Error reading last-period setup state:', error);
      return false;
    }
  }

  /** Persist completion and clear the guided setup flag. */
  async markComplete(method: OnboardingMethod): Promise<void> {
    const state = await this.getState();
    await this.saveState({
      ...state,
      completedAt: Date.now(),
      method,
      pendingLastPeriod: false,
    });
  }

  /** Clear first-run state when the user wipes their data. */
  async reset(): Promise<void> {
    try {
      await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY);
    } catch (error) {
      console.error('Error resetting onboarding state:', error);
    }
  }
}

export const OnboardingService = new OnboardingServiceClass();
