import { buildTodayTips } from '@/services/TodayTips';

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
