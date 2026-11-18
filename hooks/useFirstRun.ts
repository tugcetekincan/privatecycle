import { useCallback, useEffect, useState } from 'react';
import {
  OnboardingService,
  type FirstRunStatus,
  type OnboardingMethod,
} from '@/services/OnboardingService';

interface FirstRunState {
  status: 'loading' | FirstRunStatus;
  pendingLastPeriod: boolean;
}

/**
 * Owns the one-time root gate. Resolution runs after migrations and the
 * dev-seed gate so seeded or restored data is visible before we decide.
 */
export function useFirstRun(enabled: boolean) {
  const [state, setState] = useState<FirstRunState>({
    status: 'loading',
    pendingLastPeriod: false,
  });

  useEffect(() => {
    if (!enabled) return;

    let mounted = true;
    void OnboardingService.resolveFirstRun().then((resolution) => {
      if (!mounted) return;
      setState(resolution);
    });

    return () => {
      mounted = false;
    };
  }, [enabled]);

  const startLastPeriod = useCallback(async () => {
    await OnboardingService.beginLastPeriod();
    setState({ status: 'app', pendingLastPeriod: true });
  }, []);

  const complete = useCallback(async (method: OnboardingMethod) => {
    try {
      await OnboardingService.markComplete(method);
    } catch (error) {
      // The calendar is still usable if the preference write fails; the next
      // launch may offer the guide again, which is preferable to blocking.
      console.error('Error completing onboarding:', error);
    }
    setState({ status: 'app', pendingLastPeriod: false });
  }, []);

  const skip = useCallback(() => complete('skip'), [complete]);

  return {
    ...state,
    startLastPeriod,
    complete,
    skip,
  };
}
