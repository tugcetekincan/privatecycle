import {
  buildTodayTips,
  hasTodayLog,
  summarizeTodayLog,
} from '@/services/TodayTips';

describe('buildTodayTips', () => {
  it('returns no tips without a log', () => {
    expect(buildTodayTips(null)).toEqual([]);
    expect(buildTodayTips({})).toEqual([]);
  });

  it('turns logged symptoms into today tips, capped at two', () => {
    const tips = buildTodayTips({
      symptoms: ['cramps', 'headache', 'bloating'],
    });

    expect(tips).toEqual([
      {
        icon: '😣',
        label: 'CRAMPS',
        text: 'Use a heat pack and keep water nearby today.',
      },
      {
        icon: '🤕',
        label: 'HEADACHE',
        text: 'Keep water and meals regular, and rest your eyes when you can.',
      },
    ]);
  });

  it('falls back to mood tags when no symptom is logged', () => {
    const tips = buildTodayTips({
      symptoms: [],
      moodValence: 1,
      moodTags: [
        { id: 'anxious', level: 2 },
        { id: 'tired', level: 3 },
      ],
    });

    expect(tips).toEqual([
      {
        icon: '😰',
        label: 'ANXIOUS',
        text: 'Try a slow breathing pause and lower the stakes for the next hour.',
      },
      {
        icon: '😴',
        label: 'TIRED',
        text: 'Protect your sleep tonight and keep meals steady today.',
      },
    ]);
  });

  it('adds a gentle fallback for a low mood without tags', () => {
    const tips = buildTodayTips({ moodValence: 2, moodTags: [] });

    expect(tips).toHaveLength(1);
    expect(tips[0]).toMatchObject({ label: 'LOW MOOD' });
  });

  it('ignores unknown ids and duplicate advice', () => {
    const tips = buildTodayTips({
      symptoms: ['mystery', 'mood'],
      moodValence: 2,
      moodTags: [{ id: 'low' }],
    });

    expect(tips.map((tip) => tip.label)).toEqual(['MOOD CHANGES', 'LOW']);
  });
});

describe('hasTodayLog and summarizeTodayLog', () => {
  it('treats an empty row as no log', () => {
    expect(hasTodayLog(null)).toBe(false);
    expect(hasTodayLog({ symptoms: [], moodTags: [], moodValence: 0 })).toBe(false);
    expect(summarizeTodayLog({ symptoms: [] })).toBeNull();
  });

  it('acknowledges a headache without inventing phase advice', () => {
    const summary = summarizeTodayLog({ symptoms: ['headache'] });

    expect(summary).toEqual({
      headline: 'Headache logged',
      detail: 'Your entry is saved.',
    });
    expect(hasTodayLog({ symptoms: ['headache'] })).toBe(true);
  });

  it('acknowledges a neutral rating with no tips', () => {
    const summary = summarizeTodayLog({ moodValence: 4, moodTags: [] });

    expect(summary).toEqual({
      headline: 'Mood 4/5 logged',
      detail: 'You rated your overall mood 4/5.',
    });
    expect(buildTodayTips({ moodValence: 4, moodTags: [] })).toEqual([]);
  });

  it('acknowledges tags-only entries and a recorded ovulation', () => {
    expect(
      summarizeTodayLog({ moodValence: 0, moodTags: [{ id: 'calm', level: 2 }] })
    ).toEqual({
      headline: 'Calm logged',
      detail: 'Your entry is saved.',
    });
    expect(summarizeTodayLog({ isOvulation: true })).toEqual({
      headline: 'Ovulation recorded',
      detail: 'Your ovulation entry is saved.',
    });
  });

  it('acknowledges legacy mood text without inventing a rating or strength', () => {
    const log = { mood: 'happy' };

    expect(hasTodayLog(log)).toBe(true);
    expect(buildTodayTips(log)).toEqual([]);
    expect(summarizeTodayLog(log)).toEqual({
      headline: 'Mood logged',
      detail: 'Your saved feeling is Happy. No overall rating was recorded.',
    });
  });

  it('acknowledges a flow-only row without inferring a period', () => {
    const log = { flowLevel: 'light' };

    expect(hasTodayLog(log)).toBe(true);
    expect(summarizeTodayLog(log)).toEqual({
      headline: 'Flow noted',
      detail: 'Your flow note is saved.',
    });
  });
});
