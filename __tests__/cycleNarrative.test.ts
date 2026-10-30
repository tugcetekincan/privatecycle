import { buildNarrative } from '@/services/CycleNarrative';
import { PhaseMoodSummary } from '@/services/MoodInsights';
import { SymptomPattern } from '@/services/SymptomInsights';

const headache: SymptomPattern = {
  id: 'headache',
  days: 13,
  rate: 13 / 68,
  phaseDays: { menstrual: 1, follicular: 2, ovulation: 2, luteal: 8 },
  phaseShares: { menstrual: 1 / 13, follicular: 2 / 13, ovulation: 2 / 13, luteal: 8 / 13 },
  phasedDays: 13,
  dominantPhase: 'luteal',
  dominantShare: 8 / 13,
};

const moodPhases: PhaseMoodSummary[] = [
  { phase: 'menstrual', days: 8, averageValence: 3.4, topTags: [] },
  { phase: 'follicular', days: 20, averageValence: 4.0, topTags: [] },
  { phase: 'ovulation', days: 5, averageValence: 4.4, topTags: [] },
  { phase: 'luteal', days: 22, averageValence: 3.1, topTags: [] },
];

const periodStarts = [
  '2026-01-01', // 27 days
  '2026-01-28', // 29
  '2026-02-26', // 28
  '2026-03-26', // 26
  '2026-04-21', // 30
  '2026-05-21', // 28
  '2026-06-18',
];

describe('buildNarrative', () => {
  it('returns the three pattern cards in symptom, mood, cycle order', () => {
    const result = buildNarrative({
      symptomPatterns: [headache],
      moodPhases,
      periodStarts,
    });

    expect(result.patterns.map((pattern) => pattern.kind)).toEqual([
      'symptom',
      'mood',
      'cycle',
    ]);

    expect(result.patterns[0]).toMatchObject({
      id: 'symptom-headache',
      icon: '🤕',
      title: 'Headaches · mostly luteal',
      body: '8 of your 13 headache days fell in your luteal phase.',
      sampleLabel: '13 headache days',
      statValue: '62%',
      statLabel: 'in luteal',
      tipLabel: 'TRY THIS',
    });
    expect(result.patterns[0].visual).toMatchObject({
      type: 'phase',
      unphasedShare: 0,
    });

    expect(result.patterns[1]).toMatchObject({
      id: 'mood',
      title: 'Mood is highest in your ovulation phase',
      body: 'You average 4.4/5 in ovulation versus 3.1/5 in luteal.',
      sampleLabel: '55 mood days',
      statValue: '+1.3',
      statLabel: 'vs luteal',
      tipLabel: 'TRY THIS',
    });
    expect(result.patterns[1].visual).toEqual({
      type: 'mood',
      rows: [
        { phase: 'ovulation', label: 'Ovulation', value: 4.4 },
        { phase: 'luteal', label: 'Luteal', value: 3.1 },
      ],
    });

    expect(result.patterns[2]).toMatchObject({
      id: 'cycle',
      title: 'Your cycle is regular',
      body: 'Your last 6 cycles ranged from 26 to 30 days.',
      sampleLabel: '6 tracked cycles',
      statValue: '28d',
      statLabel: 'average',
      tipLabel: 'WHY IT MATTERS',
    });
    expect(result.patterns[2].visual).toEqual({
      type: 'range',
      min: 26,
      max: 30,
      average: 28,
    });
  });

  it('hides cards whose samples are too small', () => {
    const weakSymptom: SymptomPattern = {
      ...headache,
      days: 2,
      phasedDays: 2,
      phaseDays: { menstrual: 0, follicular: 0, ovulation: 0, luteal: 2 },
      dominantShare: 1,
    };
    const weakMood = moodPhases.map((entry) => ({
      ...entry,
      averageValence: entry.phase === 'luteal' ? 3.9 : 4.0,
    }));

    const result = buildNarrative({
      symptomPatterns: [weakSymptom],
      moodPhases: weakMood,
      periodStarts: ['2026-01-01', '2026-01-28'],
    });

    expect(result.patterns).toEqual([]);
  });

  it('returns an empty result when there is no data', () => {
    const result = buildNarrative({
      symptomPatterns: [],
      moodPhases: [],
      periodStarts: [],
    });

    expect(result).toEqual({ patterns: [] });
  });
});
