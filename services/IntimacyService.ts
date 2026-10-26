import type { IntimateData, ProtectionMethod } from './DataService';

/**
 * Pure helpers for the private intimacy calendar. The UI and the backup
 * envelope both use these so labels and month counts stay consistent, and the
 * logic can be tested without a database.
 */

export const PROTECTION_OPTIONS: ReadonlyArray<{ id: ProtectionMethod; label: string }> = [
  { id: 'protected', label: 'Protected' },
  { id: 'unprotected', label: 'Unprotected' },
  { id: 'na', label: 'Not applicable' },
];

export const protectionLabel = (id: ProtectionMethod): string => {
  return PROTECTION_OPTIONS.find(option => option.id === id)?.label ?? 'Not specified';
};

/** `YYYY-MM` prefix for the displayed local month. */
export const monthPrefix = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export interface IntimacySummary {
  /** Days logged in the displayed month. */
  monthCount: number;
  /** Days logged in the whole private log. */
  totalCount: number;
  /** Most recent logged day key, or null when the log is empty. */
  lastDate: string | null;
}

export const summarizeIntimacy = (data: IntimateData, month: Date): IntimacySummary => {
  const keys = Object.keys(data).sort();
  const prefix = `${monthPrefix(month)}-`;

  return {
    monthCount: keys.filter(key => key.startsWith(prefix)).length,
    totalCount: keys.length,
    lastDate: keys.length > 0 ? keys[keys.length - 1] : null,
  };
};
