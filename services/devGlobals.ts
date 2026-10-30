import { Platform } from 'react-native';
import { DataService } from './DataService';
import { BackupService } from './BackupService';
import { NotificationSettingsService } from './NotificationSettings';
import { PrivateAccessService } from './PrivateAccessService';
import { generateDemoDailyData, seedDemoData, resetDemoData } from './DevSeedService';

/**
 * In web dev builds, expose services on `globalThis.__privatecycle` so tests and
 * agents can inspect the database from a browser console / Playwright:
 *
 *   await __privatecycle.DataService.getAllDailyData()
 *   await __privatecycle.seedDemoData({ force: true })
 *
 * Never active in production builds.
 */
export function installDevGlobals(): void {
  if (Platform.OS !== 'web' || !__DEV__) return;

  (globalThis as any).__privatecycle = {
    DataService,
    BackupService,
    NotificationSettingsService,
    PrivateAccessService,
    seedDemoData,
    resetDemoData,
    generateDemoDailyData,
  };
}
