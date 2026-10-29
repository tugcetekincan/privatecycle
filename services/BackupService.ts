import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DataService, DailyData, IntimateData } from './DataService';
import { PrivateAccessService } from './PrivateAccessService';

export interface BackupData {
  version: string;
  timestamp: number;
  data: {
    dailyData: { [date: string]: DailyData };
    /** Present only when the user opted into including the private calendar. */
    intimateData?: IntimateData;
  };
  metadata: {
    totalDays: number;
    dateRange: {
      start: string | null;
      end: string | null;
    };
    /** True when this file contains the private intimacy calendar. */
    includesPrivateData?: boolean;
    /** Number of private days in the file, when included. */
    privateDays?: number;
  };
}

export interface BackupSettings {
  autoBackupEnabled: boolean;
  autoBackupFrequency: 'daily' | 'weekly' | 'monthly';
  keepLocalBackups: number;
  lastBackupTime: number | null;
}

export class BackupService {
  private static readonly BACKUP_FOLDER = `${FileSystem.documentDirectory}backups/`;
  private static readonly BACKUP_SETTINGS_KEY = 'backup_settings';
  private static readonly BACKUP_VERSION = '1.0.0';

  // The local-file backup features rely on expo-file-system's document directory,
  // which doesn't exist on web. On web we degrade gracefully: export/import work via
  // browser download / file picker, and folder-based operations become no-ops.
  private static get isWeb(): boolean {
    return Platform.OS === 'web';
  }

  // Trigger a browser download of the given text content (web only).
  private static downloadInBrowser(filename: string, content: string): void {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  static async initializeBackupFolder(): Promise<void> {
    if (this.isWeb) {
      return; // No persistent backup folder on web.
    }
    try {
      const folderInfo = await FileSystem.getInfoAsync(this.BACKUP_FOLDER);
      if (!folderInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.BACKUP_FOLDER, { intermediates: true });
      }
    } catch (error) {
      console.error('Error initializing backup folder:', error);
      throw error;
    }
  }

  static async getBackupSettings(): Promise<BackupSettings> {
    try {
      const settingsStr = await AsyncStorage.getItem(this.BACKUP_SETTINGS_KEY);
      if (settingsStr) {
        return JSON.parse(settingsStr);
      }
      return {
        autoBackupEnabled: false,
        autoBackupFrequency: 'weekly',
        keepLocalBackups: 5,
        lastBackupTime: null,
      };
    } catch (error) {
      console.error('Error loading backup settings:', error);
      return {
        autoBackupEnabled: false,
        autoBackupFrequency: 'weekly',
        keepLocalBackups: 5,
        lastBackupTime: null,
      };
    }
  }

  static async saveBackupSettings(settings: BackupSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(this.BACKUP_SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving backup settings:', error);
      throw error;
    }
  }

  static async createBackup(): Promise<BackupData> {
    try {
      const dailyData = await DataService.getAllDailyData();
      const dates = Object.keys(dailyData).sort();

      // Private calendar data is opt-in and excluded by default. A failure to
      // read the preference must not break normal cycle backups.
      let intimateData: IntimateData | undefined;
      try {
        if (await PrivateAccessService.isBackupEnabled()) {
          const loaded = await DataService.getIntimateData();
          if (Object.keys(loaded).length > 0) {
            intimateData = loaded;
          }
        }
      } catch (error) {
        console.error('Error checking private backup preference:', error);
      }

      const backupData: BackupData = {
        version: this.BACKUP_VERSION,
        timestamp: Date.now(),
        data: {
          dailyData,
          ...(intimateData ? { intimateData } : {}),
        },
        metadata: {
          totalDays: dates.length,
          dateRange: {
            start: dates.length > 0 ? dates[0] : null,
            end: dates.length > 0 ? dates[dates.length - 1] : null,
          },
          ...(intimateData
            ? {
                includesPrivateData: true,
                privateDays: Object.keys(intimateData).length,
              }
            : {}),
        },
      };

      return backupData;
    } catch (error) {
      console.error('Error creating backup:', error);
      throw error;
    }
  }

  static async saveBackupToFile(backupData: BackupData, filename?: string): Promise<string> {
    try {
      await this.initializeBackupFolder();
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilename = filename || `cycle_backup_${timestamp}.json`;
      const filePath = `${this.BACKUP_FOLDER}${backupFilename}`;

      await FileSystem.writeAsStringAsync(filePath, JSON.stringify(backupData, null, 2));
      
      const settings = await this.getBackupSettings();
      settings.lastBackupTime = Date.now();
      await this.saveBackupSettings(settings);

      await this.cleanupOldBackups();

      return filePath;
    } catch (error) {
      console.error('Error saving backup to file:', error);
      throw error;
    }
  }

  static async exportBackup(shareOptions: { saveToDevice?: boolean; shareFile?: boolean } = { shareFile: true }): Promise<string> {
    try {
      const backupData = await this.createBackup();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `cycle_backup_${timestamp}.json`;

      // On web there's no file system to write to or native share sheet; deliver
      // the backup as a browser download instead.
      if (this.isWeb) {
        this.downloadInBrowser(filename, JSON.stringify(backupData, null, 2));
        const settings = await this.getBackupSettings();
        settings.lastBackupTime = Date.now();
        await this.saveBackupSettings(settings);
        return filename;
      }

      let filePath: string;

      if (shareOptions.saveToDevice) {
        filePath = await this.saveBackupToFile(backupData, filename);
      } else {
        const tempPath = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(tempPath, JSON.stringify(backupData, null, 2));
        filePath = tempPath;
      }

      if (shareOptions.shareFile && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/json',
          dialogTitle: 'Export Cycle Tracker Backup',
        });
      }

      return filePath;
    } catch (error) {
      console.error('Error exporting backup:', error);
      throw error;
    }
  }

  static async importBackup(filePath?: string): Promise<{ success: boolean; message: string; stats?: any }> {
    try {
      let backupFilePath = filePath;
      
      if (!backupFilePath) {
        const result = await DocumentPicker.getDocumentAsync({
          type: 'application/json',
          copyToCacheDirectory: true,
        });

        if (result.canceled) {
          return { success: false, message: 'Import cancelled' };
        }

        if (!result.assets[0]?.uri) {
          return { success: false, message: 'No file selected' };
        }

        backupFilePath = result.assets[0].uri;
      }

      if (!backupFilePath) {
        return { success: false, message: 'No backup file path provided' };
      }

      // DocumentPicker returns a blob URL on web, which FileSystem can't read; fetch it.
      const backupContent = this.isWeb
        ? await (await fetch(backupFilePath)).text()
        : await FileSystem.readAsStringAsync(backupFilePath);
      const backupData: BackupData = JSON.parse(backupContent);

      if (!this.validateBackupData(backupData)) {
        return { success: false, message: 'Invalid backup file format' };
      }

      await this.restoreFromBackup(backupData);

      const privateDays = backupData.data.intimateData
        ? Object.keys(backupData.data.intimateData).length
        : 0;
      const stats = {
        version: backupData.version,
        timestamp: new Date(backupData.timestamp).toLocaleString(),
        totalDays: backupData.metadata.totalDays,
        dateRange: backupData.metadata.dateRange,
        includesPrivateData: backupData.data.intimateData !== undefined,
        privateDays,
      };

      return { 
        success: true, 
        message: `Successfully imported backup with ${backupData.metadata.totalDays} days of data`,
        stats
      };
    } catch (error) {
      console.error('Error importing backup:', error);
      return { success: false, message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }

  static async restoreFromBackup(backupData: BackupData): Promise<void> {
    try {
      await DataService.clearDailyData();
      await DataService.saveManyDailyData(backupData.data.dailyData);

      // Old backups predate the private calendar. Keep the device's private
      // log when the file has no private section; when it does, replace it.
      if (backupData.data.intimateData !== undefined) {
        await DataService.clearIntimateData();
        await DataService.saveManyIntimateData(backupData.data.intimateData);
      }
    } catch (error) {
      console.error('Error restoring from backup:', error);
      throw error;
    }
  }

  static validateBackupData(data: any): data is BackupData {
    if (
      !(
        data &&
        typeof data.version === 'string' &&
        typeof data.timestamp === 'number' &&
        data.data &&
        typeof data.data.dailyData === 'object' &&
        data.data.dailyData !== null &&
        data.metadata &&
        typeof data.metadata.totalDays === 'number'
      )
    ) {
      return false;
    }

    if (data.data.intimateData !== undefined) {
      if (
        !data.data.intimateData ||
        typeof data.data.intimateData !== 'object' ||
        Array.isArray(data.data.intimateData)
      ) {
        return false;
      }

      for (const day of Object.values(data.data.intimateData)) {
        if (!day || typeof day !== 'object') return false;
        const entry = day as { date?: unknown; protection?: unknown; note?: unknown };
        if (
          typeof entry.date !== 'string' ||
          typeof entry.protection !== 'string' ||
          typeof entry.note !== 'string'
        ) {
          return false;
        }
      }
    }

    if (
      data.metadata.includesPrivateData !== undefined &&
      typeof data.metadata.includesPrivateData !== 'boolean'
    ) {
      return false;
    }

    if (
      data.metadata.privateDays !== undefined &&
      typeof data.metadata.privateDays !== 'number'
    ) {
      return false;
    }

    return true;
  }

  static async getLocalBackups(): Promise<Array<{ name: string; path: string; size: number; date: Date }>> {
    if (this.isWeb) {
      return []; // No local backup folder on web.
    }
    try {
      await this.initializeBackupFolder();
      const backupFiles = await FileSystem.readDirectoryAsync(this.BACKUP_FOLDER);
      
      const backups = await Promise.all(
        backupFiles
          .filter(filename => filename.endsWith('.json'))
          .map(async (filename) => {
            const filePath = `${this.BACKUP_FOLDER}${filename}`;
            const fileInfo = await FileSystem.getInfoAsync(filePath);
            
            let backupDate: Date;
            if (fileInfo.exists && 'modificationTime' in fileInfo && fileInfo.modificationTime > 0) {
              // expo-file-system reports modificationTime in seconds since epoch,
              // while Date expects milliseconds (otherwise dates land in 1970).
              backupDate = new Date(fileInfo.modificationTime * 1000);
            } else {
              const timestampMatch = filename.match(/cycle_backup_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
              if (timestampMatch) {
                const timestamp = timestampMatch[1];
                const dateTime = timestamp.replace(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/, '$1-$2-$3T$4:$5:$6');
                backupDate = new Date(dateTime);
              } else {
                backupDate = new Date();
              }
            }
            
            return {
              name: filename,
              path: filePath,
              size: fileInfo.exists && 'size' in fileInfo ? fileInfo.size : 0,
              date: backupDate,
            };
          })
      );

      return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (error) {
      console.error('Error getting local backups:', error);
      return [];
    }
  }

  static async deleteBackup(filePath: string): Promise<void> {
    try {
      await FileSystem.deleteAsync(filePath);
    } catch (error) {
      console.error('Error deleting backup:', error);
      throw error;
    }
  }

  static async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.getLocalBackups();
      
      if (backups.length > 1) {
        const backupsToDelete = backups.slice(1);
        
        for (const backup of backupsToDelete) {
          await this.deleteBackup(backup.path);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old backups:', error);
    }
  }

  static async performAutoBackup(): Promise<boolean> {
    if (this.isWeb) {
      return false; // Auto backup writes to local files, which aren't available on web.
    }
    try {
      const settings = await this.getBackupSettings();

      if (!settings.autoBackupEnabled) {
        return false;
      }

      const now = Date.now();
      const lastBackup = settings.lastBackupTime || 0;
      const frequencyMs = this.getFrequencyInMs(settings.autoBackupFrequency);

      if (now - lastBackup >= frequencyMs) {
        const backupData = await this.createBackup();
        await this.saveBackupToFile(backupData);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error performing auto backup:', error);
      return false;
    }
  }

  static getFrequencyInMs(frequency: 'daily' | 'weekly' | 'monthly'): number {
    const day = 24 * 60 * 60 * 1000;
    switch (frequency) {
      case 'daily':
        return day;
      case 'weekly':
        return day * 7;
      case 'monthly':
        return day * 30;
      default:
        return day * 7;
    }
  }

  static async clearAllData(): Promise<void> {
    try {
      await DataService.clearAllData();
      
      const backups = await this.getLocalBackups();
      for (const backup of backups) {
        await this.deleteBackup(backup.path);
      }
      
      await AsyncStorage.removeItem(this.BACKUP_SETTINGS_KEY);
    } catch (error) {
      console.error('Error clearing all data:', error);
      throw error;
    }
  }

  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static async getBackupStats(): Promise<{
    totalBackups: number;
    totalSize: number;
    lastBackup: Date | null;
    nextAutoBackup: Date | null;
  }> {
    try {
      const backups = await this.getLocalBackups();
      const settings = await this.getBackupSettings();
      
      const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
      
      let lastBackup: Date | null = null;
      if (backups.length > 0) {
        const latestBackup = backups[0];
        const epochTime = new Date(0).getTime();
        if (latestBackup.date.getTime() > epochTime) {
          lastBackup = latestBackup.date;
        }
      }
      
      if (!lastBackup && settings.lastBackupTime && settings.lastBackupTime > 0) {
        lastBackup = new Date(settings.lastBackupTime);
      }
      
      let nextAutoBackup: Date | null = null;
      if (settings.autoBackupEnabled && settings.lastBackupTime) {
        const frequencyMs = this.getFrequencyInMs(settings.autoBackupFrequency);
        nextAutoBackup = new Date(settings.lastBackupTime + frequencyMs);
      }

      return {
        totalBackups: backups.length,
        totalSize,
        lastBackup,
        nextAutoBackup,
      };
    } catch (error) {
      console.error('Error getting backup stats:', error);
      return {
        totalBackups: 0,
        totalSize: 0,
        lastBackup: null,
        nextAutoBackup: null,
      };
    }
  }


} 