import {
  dailyEntryDirtyGroups,
  dailyEntryValuesFromData,
  moodEntryValuesFromData,
  moodHasContent,
  moodValuesEqual,
  privateEntryDirtyGroups,
  privateEntryValuesFromDraft,
  privateEntryValuesFromStored,
  unsavedChangesMessage,
  unsavedChangesSummary,
} from '@/services/UnsavedChanges';
import type { DailyData } from '@/services/DataService';

const day = (overrides: Partial<DailyData> = {}): DailyData => ({
  date: '2026-11-24',
  isPeriod: false,
  flowLevel: '',
  symptoms: [],
  mood: '',
  isOvulation: false,
  moodValence: 0,
  moodTags: [],
  ...overrides,
});

describe('unsaved daily entry comparisons', () => {
  it('treats reordered symptoms as the same draft', () => {
    const baseline = dailyEntryValuesFromData(day({ symptoms: ['cramps', 'headache'] }));
    const draft = dailyEntryValuesFromData(day({ symptoms: ['headache', 'cramps'] }));
    expect(dailyEntryDirtyGroups(draft, baseline)).toEqual([]);
  });

  it('lists changed field groups in the canonical footer order', () => {
    const baseline = dailyEntryValuesFromData(day());
    const draft = dailyEntryValuesFromData(
      day({
        isPeriod: true,
        flowLevel: 'medium',
        isOvulation: true,
        symptoms: ['cramps'],
      })
    );
    expect(dailyEntryDirtyGroups(draft, baseline)).toEqual([
      'period',
      'flow',
      'ovulation',
      'symptoms',
    ]);
    expect(unsavedChangesSummary(dailyEntryDirtyGroups(draft, baseline))).toBe(
      'Period, Flow, Ovulation and Symptoms'
    );
    expect(unsavedChangesMessage(dailyEntryDirtyGroups(draft, baseline))).toBe(
      "Your period, flow, ovulation and symptom changes haven't been saved."
    );
  });

  it('counts a guided last-period preset as unsaved when no row exists', () => {
    const baseline = dailyEntryValuesFromData(null);
    const preset = dailyEntryValuesFromData(day({ isPeriod: true }));
    expect(dailyEntryDirtyGroups(preset, baseline)).toEqual(['period']);
  });

  it('stops prompting after the draft returns to its baseline', () => {
    const baseline = dailyEntryValuesFromData(day({ symptoms: ['cramps'] }));
    const toggledOff = dailyEntryValuesFromData(day());
    expect(dailyEntryDirtyGroups(toggledOff, baseline)).toEqual(['symptoms']);
    expect(dailyEntryDirtyGroups(baseline, baseline)).toEqual([]);
  });
});

describe('unsaved private entry comparisons', () => {
  const baseline = privateEntryValuesFromStored({
    date: '2026-11-24',
    protection: 'protected',
    note: 'stored note',
  });

  it('compares trimmed notes and reports only the persisted meaning', () => {
    const same = privateEntryValuesFromDraft({
      activity: true,
      protection: 'protected',
      note: '  stored note  ',
    });
    expect(privateEntryDirtyGroups(same, baseline)).toEqual([]);

    const changed = privateEntryValuesFromDraft({
      activity: true,
      protection: 'protected',
      note: 'different note',
    });
    expect(privateEntryDirtyGroups(changed, baseline)).toEqual(['note']);
  });

  it('treats turning activity off on an existing day as an unsaved removal', () => {
    const off = privateEntryValuesFromDraft({
      activity: false,
      protection: 'protected',
      note: 'stored note',
    });
    expect(privateEntryDirtyGroups(off, baseline)).toEqual([
      'activity',
      'protection',
      'note',
    ]);
    expect(privateEntryDirtyGroups(off, privateEntryValuesFromStored(null))).toEqual([]);
  });

  it('names groups without ever including the note text', () => {
    const changed = privateEntryValuesFromDraft({
      activity: true,
      protection: 'unprotected',
      note: 'sensitive detail',
    });
    const groups = privateEntryDirtyGroups(changed, baseline);
    expect(unsavedChangesSummary(groups)).toBe('Protection and Note');
    const message = unsavedChangesMessage(groups);
    expect(message).toBe("Your protection and note changes haven't been saved.");
    expect(message).not.toContain('sensitive detail');
  });
});

describe('saved mood comparisons', () => {
  it('distinguishes an empty mood from a persisted one', () => {
    expect(moodHasContent(moodEntryValuesFromData(null))).toBe(false);
    expect(
      moodHasContent(
        moodEntryValuesFromData(day({ mood: 'calm', moodValence: 0, moodTags: [{ id: 'calm', level: 1 }] }))
      )
    ).toBe(true);
  });

  it('matches persisted mood values and ignores an unrelated day draft', () => {
    const base = moodEntryValuesFromData(day({ mood: 'calm', moodValence: 4, moodTags: [{ id: 'calm', level: 2 }] }));
    const same = moodEntryValuesFromData(day({ mood: 'calm', moodValence: 4, moodTags: [{ id: 'calm', level: 2 }] }));
    expect(moodValuesEqual(same, base)).toBe(true);

    const stronger = moodEntryValuesFromData(day({ mood: 'calm', moodValence: 4, moodTags: [{ id: 'calm', level: 3 }] }));
    expect(moodValuesEqual(stronger, base)).toBe(false);
  });
});
