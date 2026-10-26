import type { IntimateData } from '@/services/DataService';
import {
  monthPrefix,
  PROTECTION_OPTIONS,
  protectionLabel,
  summarizeIntimacy,
} from '@/services/IntimacyService';

const sample: IntimateData = {
  '2025-10-31': { date: '2025-10-31', protection: 'protected', note: '' },
  '2026-09-30': { date: '2026-09-30', protection: 'protected', note: '' },
  '2026-10-01': { date: '2026-10-01', protection: '', note: 'note' },
  '2026-10-20': { date: '2026-10-20', protection: 'unprotected', note: '' },
};

describe('IntimacyService', () => {
  it('formats a local YYYY-MM month prefix', () => {
    expect(monthPrefix(new Date(2026, 0, 5))).toBe('2026-01');
    expect(monthPrefix(new Date(2026, 11, 31))).toBe('2026-12');
  });

  it('counts only the displayed month and keeps the global last date', () => {
    expect(summarizeIntimacy(sample, new Date(2026, 9, 1))).toEqual({
      monthCount: 2,
      totalCount: 4,
      lastDate: '2026-10-20',
    });
  });

  it('does not confuse the same month in another year', () => {
    expect(summarizeIntimacy(sample, new Date(2025, 9, 1))).toEqual({
      monthCount: 1,
      totalCount: 4,
      lastDate: '2026-10-20',
    });
  });

  it('handles an empty log', () => {
    expect(summarizeIntimacy({}, new Date(2026, 9, 1))).toEqual({
      monthCount: 0,
      totalCount: 0,
      lastDate: null,
    });
  });

  it('exposes the protection labels used by the day sheet', () => {
    expect(PROTECTION_OPTIONS.map(option => option.id)).toEqual([
      'protected',
      'unprotected',
      'na',
    ]);
    expect(protectionLabel('protected')).toBe('Protected');
    expect(protectionLabel('unprotected')).toBe('Unprotected');
    expect(protectionLabel('na')).toBe('Not applicable');
    expect(protectionLabel('')).toBe('Not specified');
  });
});
