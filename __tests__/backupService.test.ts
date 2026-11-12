import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { BackupService, BackupData } from '@/services/BackupService';
import { DataService, DailyData, IntimateData } from '@/services/DataService';
import { PrivateAccessService } from '@/services/PrivateAccessService';
import { MAX_BACKUP_BYTES } from '@/services/BackupValidation';

jest.mock('@/services/DataService', () => ({
  DataService: {
    getAllDailyData: jest.fn(),
    getIntimateData: jest.fn(),
    clearAllData: jest.fn(),
    replaceAllData: jest.fn(),
  },
}));

jest.mock('@/services/PrivateAccessService', () => ({
  PrivateAccessService: {
    isBackupEnabled: jest.fn(),
  },
}));

const readDirectoryAsync = FileSystem.readDirectoryAsync as jest.Mock;
const getInfoAsync = FileSystem.getInfoAsync as jest.Mock;
const readAsStringAsync = FileSystem.readAsStringAsync as jest.Mock;

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

const samplePrivate = (date: string): IntimateData[string] => ({
  date,
  protection: 'protected',
  note: 'private note',
});

const baseBackup = (): BackupData => ({
  version: '1.0.0',
  timestamp: Date.now(),
  data: { dailyData: {} },
  metadata: { totalDays: 0, dateRange: { start: null, end: null } },
});

const backupWithDays = (
  dailyData: Record<string, DailyData>,
  intimateData?: IntimateData
): BackupData => {
  const dates = Object.keys(dailyData).sort();
  return {
    ...baseBackup(),
    data: { dailyData, ...(intimateData ? { intimateData } : {}) },
    metadata: {
      totalDays: dates.length,
      dateRange: {
        start: dates[0] ?? null,
        end: dates[dates.length - 1] ?? null,
      },
      ...(intimateData
        ? { includesPrivateData: true, privateDays: Object.keys(intimateData).length }
        : {}),
    },
  };
};

const validDayObject = (date = '2026-01-01') => ({
  date,
  isPeriod: true,
  flowLevel: 'medium',
  symptoms: ['cramps'],
  mood: 'calm',
  isOvulation: false,
});

const backupWithRawDay = (day: unknown, key = '2026-01-01'): unknown => ({
  ...baseBackup(),
  data: { dailyData: { [key]: day } },
  metadata: {
    totalDays: 1,
    dateRange: { start: key, end: key },
  },
});

describe('BackupService', () => {
  beforeEach(() => {
    mockedDataService.getAllDailyData.mockResolvedValue({});
    mockedDataService.getIntimateData.mockResolvedValue({});
    mockedDataService.clearAllData.mockResolvedValue(undefined);
    mockedDataService.replaceAllData.mockResolvedValue(undefined);
    mockedPrivateAccess.isBackupEnabled.mockResolvedValue(false);
  });

  it('treats dismissing the picker as cancellation without restoring data', async () => {
    const restore = jest.spyOn(BackupService, 'restoreFromBackup');
    const result = await BackupService.importBackup();
    expect(result).toMatchObject({ success: false, cancelled: true });
    expect(restore).not.toHaveBeenCalled();
    restore.mockRestore();
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
    const valid = baseBackup();

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

    it('accepts a full daily entry with mood detail', () => {
      const backup = backupWithDays({
        '2026-01-01': {
          ...sampleDay('2026-01-01'),
          moodValence: 3,
          moodTags: [{ id: 'calm', level: 2 }],
        },
      });

      expect(BackupService.validateBackupData(backup)).toBe(true);
    });

    it('accepts a legacy day without the optional mood fields', () => {
      const backup = backupWithDays({ '2026-01-01': sampleDay('2026-01-01') });
      expect(BackupService.validateBackupData(backup)).toBe(true);
    });

    it('accepts a real leap day and rejects a non-leap February 29', () => {
      expect(
        BackupService.validateBackupData(
          backupWithDays({ '2028-02-29': sampleDay('2028-02-29') })
        )
      ).toBe(true);

      expect(
        BackupService.validateBackupData(
          backupWithRawDay(validDayObject('2025-02-29'), '2025-02-29')
        )
      ).toBe(false);
    });

    it('accepts a legacy day from before ovulation tracking', () => {
      const legacyDay: Omit<DailyData, 'isOvulation'> = {
        date: '2026-01-01',
        isPeriod: true,
        flowLevel: 'medium',
        symptoms: ['cramps'],
        mood: 'calm',
      };
      const backup = backupWithDays({
        '2026-01-01': legacyDay as DailyData,
      });

      expect(BackupService.validateBackupData(backup)).toBe(true);
    });

    it('accepts an empty day left behind by older versions', () => {
      const backup = backupWithDays({
        '2026-01-01': {
          date: '2026-01-01',
          isPeriod: false,
          flowLevel: '',
          symptoms: [],
          mood: '',
          isOvulation: false,
        },
      });

      expect(BackupService.validateBackupData(backup)).toBe(true);
    });

    it('accepts catalog ids and extra fields from newer versions', () => {
      const backup = backupWithDays({
        '2026-01-01': {
          ...sampleDay('2026-01-01'),
          symptoms: ['cramps', 'retired-symptom'],
          futureField: 'ignored',
        } as DailyData,
        '2026-01-02': {
          ...sampleDay('2026-01-02'),
          mood: 'retired-mood',
          moodTags: [{ id: 'retired-mood', level: 1 }],
        },
      });

      expect(BackupService.validateBackupData(backup)).toBe(true);
    });

    it.each([
      ['null', null],
      ['an empty object', {}],
      ['a numeric version', { ...valid, version: 1 }],
      ['an unsupported version', { ...valid, version: '2.0.0' }],
      ['a string timestamp', { ...valid, timestamp: 'now' }],
      ['a NaN timestamp', { ...valid, timestamp: Number.NaN }],
      ['a negative timestamp', { ...valid, timestamp: -1 }],
      ['null data', { ...valid, data: null }],
      ['array data', { ...valid, data: [] }],
      ['array metadata', { ...valid, metadata: [] }],
      ['a missing dailyData map', { ...valid, data: {} }],
      ['an array dailyData map', { ...valid, data: { dailyData: [] } }],
      ['a string totalDays', { ...valid, metadata: { ...valid.metadata, totalDays: 'many' } }],
      ['a negative totalDays', { ...valid, metadata: { ...valid.metadata, totalDays: -1 } }],
      ['a fractional totalDays', { ...valid, metadata: { ...valid.metadata, totalDays: 1.5 } }],
      ['a missing dateRange', { ...valid, metadata: { totalDays: 0 } }],
      ['a null dateRange', { ...valid, metadata: { ...valid.metadata, dateRange: null } }],
      [
        'an impossible dateRange start',
        { ...valid, metadata: { ...valid.metadata, dateRange: { start: '2026-02-30', end: null } } },
      ],
      [
        'a backwards dateRange',
        {
          ...valid,
          metadata: { ...valid.metadata, dateRange: { start: '2026-03-01', end: '2026-02-01' } },
        },
      ],
      [
        'a string includesPrivateData',
        { ...valid, metadata: { ...valid.metadata, includesPrivateData: 'yes' } },
      ],
      [
        'a negative privateDays',
        { ...valid, metadata: { ...valid.metadata, privateDays: -1 } },
      ],
      [
        'a fractional privateDays',
        { ...valid, metadata: { ...valid.metadata, privateDays: 1.5 } },
      ],
    ])('rejects a backup with %s', (_label, candidate) => {
      expect(BackupService.validateBackupData(candidate)).toBe(false);
    });

    it.each([
      ['a malformed date key', backupWithRawDay(validDayObject('2026-2-01'), '2026-2-01')],
      ['an impossible date key', backupWithRawDay(validDayObject('2026-02-30'), '2026-02-30')],
      ['a non-date key', backupWithRawDay(validDayObject('not-a-date'), 'not-a-date')],
      ['a prototype key', backupWithRawDay(validDayObject('__proto__'), '__proto__')],
      [
        'a date that does not match its key',
        backupWithRawDay(validDayObject('2026-01-02'), '2026-01-01'),
      ],
      ['a non-boolean isPeriod', backupWithRawDay({ ...validDayObject(), isPeriod: 1 })],
      [
        'a non-boolean isOvulation',
        backupWithRawDay({ ...validDayObject(), isOvulation: 'yes' }),
      ],
      ['a string symptoms value', backupWithRawDay({ ...validDayObject(), symptoms: 'cramps' })],
      ['an empty symptom id', backupWithRawDay({ ...validDayObject(), symptoms: [''] })],
      [
        'a fractional mood valence',
        backupWithRawDay({ ...validDayObject(), moodValence: 2.5 }),
      ],
      ['an out-of-range mood valence', backupWithRawDay({ ...validDayObject(), moodValence: 6 })],
      ['a string mood valence', backupWithRawDay({ ...validDayObject(), moodValence: '3' })],
      ['a non-array moodTags', backupWithRawDay({ ...validDayObject(), moodTags: 'calm' })],
      [
        'a mood tag without a level',
        backupWithRawDay({ ...validDayObject(), moodTags: [{ id: 'calm' }] }),
      ],
      [
        'an out-of-range mood tag level',
        backupWithRawDay({ ...validDayObject(), moodTags: [{ id: 'calm', level: 4 }] }),
      ],
      [
        'a mood tag with an empty id',
        backupWithRawDay({ ...validDayObject(), moodTags: [{ id: '', level: 1 }] }),
      ],
    ])('rejects a daily entry with %s', (_label, candidate) => {
      expect(BackupService.validateBackupData(candidate)).toBe(false);
    });

    it.each([
      [
        'an array private section',
        { ...validWithPrivate, data: { dailyData: {}, intimateData: [] } },
      ],
      [
        'an impossible private date key',
        {
          ...validWithPrivate,
          data: {
            dailyData: {},
            intimateData: {
              '2026-02-30': { date: '2026-02-30', protection: 'protected', note: '' },
            },
          },
        },
      ],
      [
        'a private date that does not match its key',
        {
          ...validWithPrivate,
          data: {
            dailyData: {},
            intimateData: {
              '2026-01-01': { date: '2026-01-02', protection: 'protected', note: '' },
            },
          },
        },
      ],
      [
        'a non-string protection value',
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
        'a missing private note',
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
    ])('rejects a private entry with %s', (_label, candidate) => {
      expect(BackupService.validateBackupData(candidate)).toBe(false);
    });
  });

  describe('restoreFromBackup', () => {
    it('replaces cycle data through one atomic call and preserves private data when absent', async () => {
      const backup = backupWithDays({
        '2026-01-01': sampleDay('2026-01-01'),
        '2026-01-02': sampleDay('2026-01-02'),
      });

      await BackupService.restoreFromBackup(backup);

      expect(mockedDataService.replaceAllData).toHaveBeenCalledTimes(1);
      expect(mockedDataService.replaceAllData).toHaveBeenCalledWith(
        backup.data.dailyData,
        undefined
      );
      expect(mockedDataService.clearAllData).not.toHaveBeenCalled();
    });

    it('replaces private data when the backup includes it', async () => {
      const backup = backupWithDays(
        { '2026-01-01': sampleDay('2026-01-01') },
        { '2026-01-01': samplePrivate('2026-01-01') }
      );

      await BackupService.restoreFromBackup(backup);

      expect(mockedDataService.replaceAllData).toHaveBeenCalledWith(
        backup.data.dailyData,
        backup.data.intimateData
      );
    });

    it('rejects invalid data before touching any table', async () => {
      const invalid = backupWithRawDay({
        ...validDayObject(),
        isPeriod: 'yes',
      }) as unknown as BackupData;

      await expect(BackupService.restoreFromBackup(invalid)).rejects.toThrow(
        'Invalid backup data'
      );
      expect(mockedDataService.replaceAllData).not.toHaveBeenCalled();
    });

    it('propagates a failed write so the caller can report it', async () => {
      const backup = backupWithDays({ '2026-01-01': sampleDay('2026-01-01') });
      mockedDataService.replaceAllData.mockRejectedValueOnce(new Error('disk full'));

      await expect(BackupService.restoreFromBackup(backup)).rejects.toThrow('disk full');
    });
  });

  describe('importBackup', () => {
    const backup = backupWithDays({
      '2026-01-01': sampleDay('2026-01-01'),
      '2026-01-02': sampleDay('2026-01-02'),
    });

    beforeEach(() => {
      getInfoAsync.mockResolvedValue({
        exists: true,
        uri: 'file:///backup.json',
        size: 1024,
        isDirectory: false,
        modificationTime: 0,
      });
      readAsStringAsync.mockResolvedValue(JSON.stringify(backup));
    });

    it('imports a valid file and reports the actual day count', async () => {
      const mismatched = { ...backup, metadata: { ...backup.metadata, totalDays: 99 } };
      readAsStringAsync.mockResolvedValue(JSON.stringify(mismatched));

      const result = await BackupService.importBackup('file:///backup.json');

      expect(result.success).toBe(true);
      expect(result.stats.totalDays).toBe(2);
      expect(result.message).toContain('2 days');
      expect(mockedDataService.replaceAllData).toHaveBeenCalledTimes(1);
    });

    it('rejects an oversized file before reading it', async () => {
      getInfoAsync.mockResolvedValue({
        exists: true,
        uri: 'file:///backup.json',
        size: MAX_BACKUP_BYTES + 1,
        isDirectory: false,
        modificationTime: 0,
      });

      const result = await BackupService.importBackup('file:///backup.json');

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/too large/i);
      expect(readAsStringAsync).not.toHaveBeenCalled();
      expect(mockedDataService.replaceAllData).not.toHaveBeenCalled();
    });

    it('rejects an oversized web download from its content length', async () => {
      const originalPlatform = Platform.OS;
      const originalFetch = global.fetch;
      const fetchMock = jest.fn(async () => ({
        headers: {
          get: () => String(MAX_BACKUP_BYTES + 1),
        },
        text: async () => '',
      }));

      Platform.OS = 'web';
      global.fetch = fetchMock as unknown as typeof fetch;

      try {
        const result = await BackupService.importBackup('blob:backup');

        expect(result.success).toBe(false);
        expect(result.message).toMatch(/too large/i);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(mockedDataService.replaceAllData).not.toHaveBeenCalled();
      } finally {
        Platform.OS = originalPlatform;
        global.fetch = originalFetch;
      }
    });

    it('rejects malformed JSON with a clear message', async () => {
      readAsStringAsync.mockResolvedValue('{"version": "1.0.0",');

      const result = await BackupService.importBackup('file:///backup.json');

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/not valid JSON/i);
      expect(mockedDataService.replaceAllData).not.toHaveBeenCalled();
    });

    it('rejects a structurally invalid backup before restoring', async () => {
      readAsStringAsync.mockResolvedValue(
        JSON.stringify(
          backupWithRawDay({ ...validDayObject(), symptoms: 'cramps' })
        )
      );

      const result = await BackupService.importBackup('file:///backup.json');

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/invalid backup/i);
      expect(mockedDataService.replaceAllData).not.toHaveBeenCalled();
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
