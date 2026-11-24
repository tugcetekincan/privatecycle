import type { DailyData, IntimateDay, ProtectionMethod } from './DataService';
import type { MoodTag } from './MoodTags';

/**
 * PRIVATECYC-7 option B: compare the open entry with what is actually stored,
 * so the footer can name the field groups that are still unsaved and the close
 * guard can avoid prompting when the draft is back at its baseline.
 *
 * The helpers are pure so the comparison rules (canonical group order,
 * order-insensitive symptoms, trimmed private notes) are unit-tested without
 * mounting either sheet.
 */

export type DailyUnsavedGroup = 'period' | 'flow' | 'ovulation' | 'symptoms';
export type PrivateUnsavedGroup = 'activity' | 'protection' | 'note';
export type UnsavedGroup = DailyUnsavedGroup | PrivateUnsavedGroup;

export interface DailyEntryValues {
  isPeriod: boolean;
  flowLevel: string;
  isOvulation: boolean;
  symptoms: string[];
}

export interface PrivateEntryValues {
  activity: boolean;
  protection: ProtectionMethod;
  note: string;
}

export interface MoodEntryValues {
  /** Legacy mood id mirrored by the first selected tag. */
  mood: string;
  valence: number;
  tags: MoodTag[];
}

const DAILY_LABELS: Record<DailyUnsavedGroup, string> = {
  period: 'Period',
  flow: 'Flow',
  ovulation: 'Ovulation',
  symptoms: 'Symptoms',
};

const DAILY_MESSAGE_LABELS: Record<DailyUnsavedGroup, string> = {
  period: 'period',
  flow: 'flow',
  ovulation: 'ovulation',
  symptoms: 'symptom',
};

const PRIVATE_LABELS: Record<PrivateUnsavedGroup, string> = {
  activity: 'Activity',
  protection: 'Protection',
  note: 'Note',
};

const PRIVATE_MESSAGE_LABELS: Record<PrivateUnsavedGroup, string> = {
  activity: 'activity',
  protection: 'protection',
  note: 'note',
};

const canonicalSymptoms = (symptoms: string[] | undefined): string[] =>
  Array.from(new Set(symptoms ?? [])).sort();

export const dailyEntryValuesFromData = (
  data: DailyData | null | undefined
): DailyEntryValues => ({
  isPeriod: Boolean(data?.isPeriod),
  flowLevel: data?.flowLevel ?? '',
  isOvulation: Boolean(data?.isOvulation),
  symptoms: canonicalSymptoms(data?.symptoms),
});

const sameSymptoms = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index]);

/** Field groups in the order the footer and dialog should list them. */
export const dailyEntryDirtyGroups = (
  draft: DailyEntryValues,
  baseline: DailyEntryValues
): DailyUnsavedGroup[] => {
  const groups: DailyUnsavedGroup[] = [];
  if (draft.isPeriod !== baseline.isPeriod) groups.push('period');
  if ((draft.flowLevel ?? '') !== (baseline.flowLevel ?? '')) groups.push('flow');
  if (draft.isOvulation !== baseline.isOvulation) groups.push('ovulation');
  if (!sameSymptoms(canonicalSymptoms(draft.symptoms), canonicalSymptoms(baseline.symptoms))) {
    groups.push('symptoms');
  }
  return groups;
};

export const privateEntryValuesFromStored = (
  day: IntimateDay | null | undefined
): PrivateEntryValues => {
  if (!day) return { activity: false, protection: '', note: '' };
  return {
    activity: true,
    protection: day.protection ?? '',
    // Saved notes are trimmed before storage; compare what was persisted.
    note: (day.note ?? '').trim(),
  };
};

export const privateEntryValuesFromDraft = (draft: {
  activity: boolean;
  protection: ProtectionMethod;
  note: string;
}): PrivateEntryValues => {
  if (!draft.activity) {
    return { activity: false, protection: '', note: '' };
  }
  return {
    activity: true,
    protection: draft.protection ?? '',
    note: (draft.note ?? '').trim(),
  };
};

export const privateEntryDirtyGroups = (
  draft: PrivateEntryValues,
  baseline: PrivateEntryValues
): PrivateUnsavedGroup[] => {
  const groups: PrivateUnsavedGroup[] = [];
  if (draft.activity !== baseline.activity) groups.push('activity');
  if ((draft.protection ?? '') !== (baseline.protection ?? '')) groups.push('protection');
  if ((draft.note ?? '') !== (baseline.note ?? '')) groups.push('note');
  return groups;
};

export const moodEntryValuesFromData = (
  data: DailyData | null | undefined
): MoodEntryValues => ({
  mood: data?.mood ?? '',
  valence: data?.moodValence ?? 0,
  tags: data?.moodTags ?? [],
});

/** Whether a mood value represents something the user actually logged. */
export const moodHasContent = (values: MoodEntryValues): boolean =>
  values.valence > 0 || values.tags.length > 0 || values.mood !== '';

const sameMoodTags = (a: MoodTag[], b: MoodTag[]): boolean =>
  a.length === b.length &&
  a.every((tag, index) => tag.id === b[index].id && tag.level === b[index].level);

export const moodValuesEqual = (a: MoodEntryValues, b: MoodEntryValues): boolean =>
  a.mood === b.mood && a.valence === b.valence && sameMoodTags(a.tags, b.tags);

/** Literal labels for the proactive footer status. */
export const unsavedGroupLabels = (groups: UnsavedGroup[]): string[] =>
  groups.map((group) =>
    group in DAILY_LABELS
      ? DAILY_LABELS[group as DailyUnsavedGroup]
      : PRIVATE_LABELS[group as PrivateUnsavedGroup]
  );

/** "Period, Flow and Symptoms" without leaking private content. */
export const unsavedChangesSummary = (groups: UnsavedGroup[]): string => {
  const labels = unsavedGroupLabels(groups);
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
};

const messageList = (groups: UnsavedGroup[]): string => {
  const labels = groups.map((group) =>
    group in DAILY_MESSAGE_LABELS
      ? DAILY_MESSAGE_LABELS[group as DailyUnsavedGroup]
      : PRIVATE_MESSAGE_LABELS[group as PrivateUnsavedGroup]
  );
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
};

/** Dialog copy names the groups only; private notes are never included. */
export const unsavedChangesMessage = (groups: UnsavedGroup[]): string => {
  if (groups.length === 0) return '';
  const list = messageList(groups);
  return groups.length === 1
    ? `Your ${list} change hasn't been saved.`
    : `Your ${list} changes haven't been saved.`;
};
