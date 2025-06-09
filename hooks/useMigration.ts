import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DataService } from '@/services/DataService';

export const useMigration = () => {
  const [migrationStatus, setMigrationStatus] = useState<'pending' | 'migrating' | 'completed' | 'error'>('pending');

  useEffect(() => {
    const performMigration = async () => {
      try {
        const migrationCompleted = await AsyncStorage.getItem('migration_completed');
        
        if (migrationCompleted === 'true') {
          setMigrationStatus('completed');
          return;
        }

        setMigrationStatus('migrating');
        
        await DataService.migrateFromAsyncStorage();
        
        await AsyncStorage.setItem('migration_completed', 'true');
        setMigrationStatus('completed');
        
      } catch (error) {
        console.error('Migration failed:', error);
        setMigrationStatus('error');
      }
    };

    performMigration();
  }, []);

  return {
    migrationStatus,
    isCompleted: migrationStatus === 'completed',
    isError: migrationStatus === 'error',
    isMigrating: migrationStatus === 'migrating'
  };
}; 