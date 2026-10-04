import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { resetDemoData, seedDemoData } from '@/services/DevSeedService';

/**
 * Web-only development helper. When the app is opened with:
 *
 *   ?seed=1      -> seed demo data if the database is empty
 *   ?seed=force  -> wipe and reseed demo data (deterministic)
 *   ?reset=1     -> wipe all tracking data
 *
 * the action runs once, before the first screen renders, and the query string
 * is cleaned up so app state does not depend on it. Disabled in production
 * builds (`__DEV__`).
 */

export type DevSeedAction = 'seed' | 'force' | 'reset';

export function parseDevSeedAction(search: string): DevSeedAction | null {
  const params = new URLSearchParams(search);
  const seed = params.get('seed');
  if (seed === '1') return 'seed';
  if (seed === 'force') return 'force';
  if (params.get('reset') === '1') return 'reset';
  return null;
}

export async function runDevSeedAction(action: DevSeedAction) {
  if (action === 'reset') {
    await resetDemoData();
    return { days: 0, skipped: false };
  }
  return seedDemoData({ force: action === 'force' });
}

export function useDevSeed(enabled: boolean) {
  const isWebDev = Platform.OS === 'web' && __DEV__;
  const [handled, setHandled] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!enabled || !isWebDev || ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        const action = parseDevSeedAction(window.location.search);
        if (action) {
          const result = await runDevSeedAction(action);
          console.log(`[dev-seed] action=${action}`, result);
        }
      } catch (error) {
        console.error('[dev-seed] failed:', error);
      } finally {
        // Strip dev params so a reload keeps the current state.
        const params = new URLSearchParams(window.location.search);
        params.delete('seed');
        params.delete('reset');
        const query = params.toString();
        window.history.replaceState(
          {},
          '',
          window.location.pathname + (query ? `?${query}` : '') + window.location.hash
        );
        setHandled(true);
      }
    })();
  }, [enabled, isWebDev]);

  // Native and production builds are never gated. On web dev the UI waits
  // until the requested action has finished, so screens never read the DB
  // mid-seed.
  return { ready: !isWebDev || handled };
}
