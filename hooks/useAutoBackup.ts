import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { BackupService } from '@/services/BackupService';

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
      } catch (error) {
        console.error('Auto backup failed:', error);
      }
    }
    appState.current = nextAppState;
  };

  const triggerAutoBackup = async (): Promise<boolean> => {
    try {
      return await BackupService.performAutoBackup();
    } catch (error) {
      console.error('Manual auto backup failed:', error);
      return false;
    }
  };

  return { triggerAutoBackup };
}; 