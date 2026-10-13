import * as FileSystem from 'expo-file-system';
import { BackupService, BackupData } from '@/services/BackupService';
import { DataService, DailyData } from '@/services/DataService';

jest.mock('@/services/DataService', () => ({
  DataService: {
    getAllDailyData: jest.fn(),
    clearAllData: jest.fn(),
    saveTodayData: jest.fn(),
    saveManyDailyData: jest.fn(),
  },
}));

const readDirectoryAsync = FileSystem.readDirectoryAsync as jest.Mock;
const getInfoAsync = FileSystem.getInfoAsync as jest.Mock;

const mockedDataService = DataService as jest.Mocked<typeof DataService>;

const sampleDay = (date: string, isOvulation = false): DailyData => ({
  date,
  isPeriod: true,
  flowLevel: 'medium',
  symptoms: ['cramps'],
  mood: 'calm',
  isOvulation,
});

describe('BackupService', () => {
  beforeEach(() => {
    mockedDataService.getAllDailyData.mockResolvedValue({});
  });

  describe('createBackup', () => {
    it('wraps daily data with version, timestamp and metadata', async () => {
      mockedDataService.getAllDailyData.mockResolvedValue({
        '2026-01-02': sampleDay('2026-01-02'),
        '2026-01-01': sampleDay('2026-01-01', true),
      });

      const backup = await BackupService.createBackup();

      expect(backup.version).toBe('1.0.0');
      expect(typeof backup.timestamp).toBe('number');
      expect(backup.metadata.totalDays).toBe(2);
      expect(backup.metadata.dateRange).toEqual({ start: '2026-01-01', end: '2026-01-02' });
      expect(backup.data.dailyData['2026-01-01'].isOvulation).toBe(true);
      expect(backup.data.dailyData['2026-01-02'].isOvulation).toBe(false);
    });

    it('handles an empty database', async () => {
      const backup = await BackupService.createBackup();
      expect(backup.metadata.totalDays).toBe(0);
      expect(backup.metadata.dateRange).toEqual({ start: null, end: null });
    });
  });

  describe('validateBackupData', () => {
    const valid: BackupData = {
      version: '1.0.0',
      timestamp: Date.now(),
      data: { dailyData: {} },
      metadata: { totalDays: 0, dateRange: { start: null, end: null } },
    };

    it('accepts a well-formed backup', () => {
      expect(BackupService.validateBackupData(valid)).toBe(true);
    });

    it.each([
      [null],
      [{}],
      [{ ...valid, version: 1 }],
      [{ ...valid, timestamp: 'now' }],
      [{ ...valid, data: null }],
      [{ ...valid, metadata: { totalDays: 'many' } }],
    ])('rejects malformed backup: %p', (candidate) => {
      expect(BackupService.validateBackupData(candidate)).toBe(false);
    });
  });

  describe('restoreFromBackup', () => {
    it('clears existing data and bulk-inserts the backup atomically', async () => {
      const backup: BackupData = {
        version: '1.0.0',
        timestamp: Date.now(),
        data: {
          dailyData: {
            '2026-01-01': sampleDay('2026-01-01'),
            '2026-01-02': sampleDay('2026-01-02'),
          },
        },
        metadata: { totalDays: 2, dateRange: { start: '2026-01-01', end: '2026-01-02' } },
      };

      await BackupService.restoreFromBackup(backup);

      expect(mockedDataService.clearAllData).toHaveBeenCalledTimes(1);
      expect(mockedDataService.saveManyDailyData).toHaveBeenCalledWith(backup.data.dailyData);
    });
  });

  describe('getLocalBackups', () => {
    const backupFilename = 'cycle_backup_2026-03-15T10-30-00.json';
    const modifiedSeconds = Date.UTC(2026, 2, 15, 10, 30, 0) / 1000;

    beforeEach(() => {
      readDirectoryAsync.mockResolvedValue([backupFilename]);
      getInfoAsync.mockResolvedValue({
        exists: true,
        uri: `file:///document/backups/${backupFilename}`,
        size: 2048,
        isDirectory: false,
        modificationTime: modifiedSeconds,
      });
    });

    it('converts file modificationTime from seconds to a Date (not 1970)', async () => {
      const backups = await BackupService.getLocalBackups();

      expect(backups).toHaveLength(1);
      expect(backups[0].date.getTime()).toBe(modifiedSeconds * 1000);
      expect(backups[0].date.getUTCFullYear()).toBe(2026);
    });

    it('reports the corrected date as lastBackup in getBackupStats', async () => {
      const stats = await BackupService.getBackupStats();

      expect(stats.totalBackups).toBe(1);
      expect(stats.lastBackup?.getTime()).toBe(modifiedSeconds * 1000);
    });
  });

  describe('getFrequencyInMs', () => {
    it('maps frequencies to milliseconds', () => {
      const day = 24 * 60 * 60 * 1000;
      expect(BackupService.getFrequencyInMs('daily')).toBe(day);
      expect(BackupService.getFrequencyInMs('weekly')).toBe(day * 7);
      expect(BackupService.getFrequencyInMs('monthly')).toBe(day * 30);
    });
  });

  describe('formatFileSize', () => {
    it('formats byte sizes', () => {
      expect(BackupService.formatFileSize(0)).toBe('0 B');
      expect(BackupService.formatFileSize(1024)).toBe('1 KB');
      expect(BackupService.formatFileSize(1024 * 1024)).toBe('1 MB');
    });
  });
});
