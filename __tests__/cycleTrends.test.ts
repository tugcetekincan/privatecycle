import { buildCycleModel } from '@/services/CycleModel';
import {
  phaseTrackSegments,
  summarizeCycleLengths,
} from '@/services/CycleTrends';

const startsWithSixCycles = [
  '2026-01-01', // 27 days
  '2026-01-28', // 29
  '2026-02-26', // 28
  '2026-03-26', // 26
  '2026-04-21', // 30
  '2026-05-21', // 28
  '2026-06-18',
];

describe('summarizeCycleLengths', () => {
  it('summarises the last six completed cycles', () => {
    const summary = summarizeCycleLengths(startsWithSixCycles);

    expect(summary.points).toHaveLength(6);
    expect(summary.lengths).toEqual([27, 29, 28, 26, 30, 28]);
    expect(summary.average).toBe(28);
    expect(summary.min).toBe(26);
    expect(summary.max).toBe(30);
    expect(summary.halfRange).toBe(2);
    expect(summary.regularity).toBe('regular');
    expect(summary.points[0]).toEqual({
      start: '2026-01-01',
      end: '2026-01-28',
      length: 27,
    });
    expect(summary.points[5]).toEqual({
      start: '2026-05-21',
      end: '2026-06-18',
      length: 28,
    });
  });

  it('limits the history without losing the most recent cycles', () => {
    const summary = summarizeCycleLengths(startsWithSixCycles, 2);

    expect(summary.lengths).toEqual([30, 28]);
    expect(summary.average).toBe(29);
    expect(summary.min).toBe(28);
    expect(summary.max).toBe(30);
    expect(summary.halfRange).toBe(1);
    expect(summary.regularity).toBe('regular');
  });

  it('needs two period starts before it can report a completed cycle', () => {
    const summary = summarizeCycleLengths(['2026-01-01']);

    expect(summary.points).toEqual([]);
    expect(summary.average).toBeNull();
    expect(summary.halfRange).toBeNull();
    expect(summary.regularity).toBeNull();
  });

  it('reports one completed cycle without inventing a variation', () => {
    const summary = summarizeCycleLengths(['2026-01-01', '2026-01-28']);

    expect(summary.points).toHaveLength(1);
    expect(summary.average).toBe(27);
    expect(summary.min).toBe(27);
    expect(summary.max).toBe(27);
    expect(summary.halfRange).toBeNull();
    expect(summary.regularity).toBeNull();
  });

  it('flags a wide range as variable', () => {
    const summary = summarizeCycleLengths([
      '2025-06-21',
      '2025-07-15',
      '2025-09-04',
    ]);

    expect(summary.lengths).toEqual([24, 51]);
    expect(summary.halfRange).toBe(14);
    expect(summary.regularity).toBe('variable');
  });

  it('sorts unsorted starts before measuring', () => {
    const summary = summarizeCycleLengths([
      '2026-01-01',
      '2026-02-26',
      '2026-01-28',
    ]);

    expect(summary.lengths).toEqual([27, 29]);
  });
});

describe('phaseTrackSegments', () => {
  it('splits a 30-day cycle using the shared phase windows', () => {
    const model = buildCycleModel({
      periodStarts: ['2026-09-01', '2026-10-01'],
      ovulationDays: [],
      today: new Date('2026-09-15T12:00:00'),
    });
    const current = model.windows.find((window) => window.isCurrent);
    expect(current).toBeDefined();

    const segments = phaseTrackSegments(current!);

    expect(segments.map((segment) => segment.phase)).toEqual([
      'menstrual',
      'follicular',
      'ovulation',
      'luteal',
    ]);
    expect(segments.map((segment) => segment.days)).toEqual([6, 10, 3, 11]);
    expect(segments.reduce((total, segment) => total + segment.share, 0)).toBe(1);
  });

  it('never produces negative or overflowing segments for a short cycle', () => {
    const model = buildCycleModel({
      periodStarts: ['2026-09-01', '2026-09-04'],
      ovulationDays: [],
      today: new Date('2026-09-02T12:00:00'),
    });

    const segments = phaseTrackSegments(model.windows[0]);

    expect(segments.reduce((total, segment) => total + segment.days, 0)).toBe(3);
    expect(segments.every((segment) => segment.days >= 0)).toBe(true);
  });
});
