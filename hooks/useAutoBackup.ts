import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { BackupService } from '@/services/BackupService';
import { NotificationService } from '@/services/NotificationService';

export const useAutoBackup = () => {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, []);

  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (appState.current?.match(/inactive|background/) && nextAppState === 'active') {
      try {
        await BackupService.performAutoBackup();
        void NotificationService.syncSchedule();
      } catch (error) {
        console.error('Auto backup failed:', error);
      }
    }
    appState.current = nextAppState;
  };

  const triggerAutoBackup = async (): Promise<boolean> => {
    try {
      const result = await BackupService.performAutoBackup();
      void NotificationService.syncSchedule();
      return result;
    } catch (error) {
      console.error('Manual auto backup failed:', error);
      return false;
    }
  };

  return { triggerAutoBackup };
}; 