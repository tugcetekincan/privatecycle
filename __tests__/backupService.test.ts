import * as FileSystem from 'expo-file-system';
import { BackupService, BackupData } from '@/services/BackupService';
import { DataService, DailyData } from '@/services/DataService';
import { PrivateAccessService } from '@/services/PrivateAccessService';

jest.mock('@/services/DataService', () => ({
  DataService: {
    getAllDailyData: jest.fn(),
    getIntimateData: jest.fn(),
    clearAllData: jest.fn(),
    clearDailyData: jest.fn(),
    clearIntimateData: jest.fn(),
    saveTodayData: jest.fn(),
    saveManyDailyData: jest.fn(),
    saveManyIntimateData: jest.fn(),
  },
}));

jest.mock('@/services/PrivateAccessService', () => ({
  PrivateAccessService: {
    isBackupEnabled: jest.fn(),
  },
}));

const readDirectoryAsync = FileSystem.readDirectoryAsync as jest.Mock;
const getInfoAsync = FileSystem.getInfoAsync as jest.Mock;

const mockedDataService = DataService as jest.Mocked<typeof DataService>;
const mockedPrivateAccess = PrivateAccessService as jest.Mocked<typeof PrivateAccessService>;

const sampleDay = (date: string, isOvulation = false): DailyData => ({
  date,
  isPeriod: true,
  flowLevel: 'medium',
  symptoms: ['cramps'],
  mood: 'calm',
  isOvulation,
});

const samplePrivate = (date: string) => ({
  date,
  protection: 'protected' as const,
  note: 'private note',
});

describe('BackupService', () => {
  it('treats dismissing the picker as cancellation without restoring data', async () => {
    const restore = jest.spyOn(BackupService, 'restoreFromBackup');
    const result = await BackupService.importBackup();
    expect(result).toMatchObject({ success: false, cancelled: true });
    expect(restore).not.toHaveBeenCalled();
    restore.mockRestore();
  });
  beforeEach(() => {
    mockedDataService.getAllDailyData.mockResolvedValue({});
    mockedDataService.getIntimateData.mockResolvedValue({});
    mockedDataService.clearDailyData.mockResolvedValue(undefined);
    mockedDataService.clearIntimateData.mockResolvedValue(undefined);
    mockedDataService.saveManyIntimateData.mockResolvedValue(undefined);
    mockedPrivateAccess.isBackupEnabled.mockResolvedValue(false);
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
      expect(backup.data.intimateData).toBeUndefined();
      expect(backup.metadata.includesPrivateData).toBeUndefined();
    });

    it('handles an empty database', async () => {
      const backup = await BackupService.createBackup();
      expect(backup.metadata.totalDays).toBe(0);
      expect(backup.metadata.dateRange).toEqual({ start: null, end: null });
    });

    it('does not read private data when the preference is off', async () => {
      await BackupService.createBackup();

      expect(mockedPrivateAccess.isBackupEnabled).toHaveBeenCalled();
      expect(mockedDataService.getIntimateData).not.toHaveBeenCalled();
    });

    it('includes private data when the preference is on', async () => {
      mockedPrivateAccess.isBackupEnabled.mockResolvedValue(true);
      mockedDataService.getIntimateData.mockResolvedValue({
        '2026-01-01': samplePrivate('2026-01-01'),
        '2026-01-02': samplePrivate('2026-01-02'),
      });

      const backup = await BackupService.createBackup();

      expect(backup.data.intimateData).toEqual({
        '2026-01-01': samplePrivate('2026-01-01'),
        '2026-01-02': samplePrivate('2026-01-02'),
      });
      expect(backup.metadata.includesPrivateData).toBe(true);
      expect(backup.metadata.privateDays).toBe(2);
    });

    it('omits an empty private log even when the preference is on', async () => {
      mockedPrivateAccess.isBackupEnabled.mockResolvedValue(true);

      const backup = await BackupService.createBackup();

      expect(backup.data.intimateData).toBeUndefined();
      expect(backup.metadata.includesPrivateData).toBeUndefined();
      expect(backup.metadata.privateDays).toBeUndefined();
    });
  });

  describe('validateBackupData', () => {
    const valid: BackupData = {
      version: '1.0.0',
      timestamp: Date.now(),
      data: { dailyData: {} },
      metadata: { totalDays: 0, dateRange: { start: null, end: null } },
    };

    const validWithPrivate: BackupData = {
      ...valid,
      data: {
        dailyData: {},
        intimateData: {
          '2026-01-01': { date: '2026-01-01', protection: 'protected', note: 'note' },
        },
      },
      metadata: {
        ...valid.metadata,
        includesPrivateData: true,
        privateDays: 1,
      },
    };

    it('accepts a well-formed backup', () => {
      expect(BackupService.validateBackupData(valid)).toBe(true);
    });

    it('accepts optional private calendar data', () => {
      expect(BackupService.validateBackupData(validWithPrivate)).toBe(true);
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

    it.each([
      [{ ...validWithPrivate, data: { dailyData: {}, intimateData: [] } }],
      [
        {
          ...validWithPrivate,
          data: {
            dailyData: {},
            intimateData: {
              '2026-01-01': { date: '2026-01-01', protection: true, note: '' },
            },
          },
        },
      ],
      [
        {
          ...validWithPrivate,
          data: {
            dailyData: {},
            intimateData: {
              '2026-01-01': { date: '2026-01-01', protection: 'protected' },
            },
          },
        },
      ],
      [
        {
          ...validWithPrivate,
          metadata: { ...validWithPrivate.metadata, includesPrivateData: 'yes' },
        },
      ],
      [
        {
          ...validWithPrivate,
          metadata: { ...validWithPrivate.metadata, privateDays: 'one' },
        },
      ],
    ])('rejects malformed private calendar data: %p', (candidate) => {
      expect(BackupService.validateBackupData(candidate)).toBe(false);
    });
  });

  describe('restoreFromBackup', () => {
    it('replaces cycle data while preserving private data when the file has none', async () => {
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

      expect(mockedDataService.clearDailyData).toHaveBeenCalledTimes(1);
      expect(mockedDataService.clearAllData).not.toHaveBeenCalled();
      expect(mockedDataService.saveManyDailyData).toHaveBeenCalledWith(backup.data.dailyData);
      expect(mockedDataService.clearIntimateData).not.toHaveBeenCalled();
      expect(mockedDataService.saveManyIntimateData).not.toHaveBeenCalled();
    });

    it('replaces private data when the backup includes it', async () => {
      const backup: BackupData = {
        version: '1.0.0',
        timestamp: Date.now(),
        data: {
          dailyData: { '2026-01-01': sampleDay('2026-01-01') },
          intimateData: { '2026-01-01': samplePrivate('2026-01-01') },
        },
        metadata: {
          totalDays: 1,
          dateRange: { start: '2026-01-01', end: '2026-01-01' },
          includesPrivateData: true,
          privateDays: 1,
        },
      };

      await BackupService.restoreFromBackup(backup);

      expect(mockedDataService.clearIntimateData).toHaveBeenCalledTimes(1);
      expect(mockedDataService.saveManyIntimateData).toHaveBeenCalledWith(
        backup.data.intimateData
      );
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
