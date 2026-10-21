import { summarizeSymptomPatterns } from '@/services/SymptomInsights';

describe('summarizeSymptomPatterns', () => {
  const periodStarts = ['2026-06-01', '2026-06-29'];
  const days = [
    { date: '2026-06-01', symptoms: ['cramps', 'fatigue'] }, // menstrual
    { date: '2026-06-02', symptoms: ['cramps', 'cramps'] }, // menstrual, duplicate id
    { date: '2026-06-10', symptoms: ['headache'] }, // follicular
    { date: '2026-06-15', symptoms: ['headache', 'cramps'] }, // ovulation
    { date: '2026-06-25', symptoms: ['headache', 'bloating'] }, // luteal
    { date: '2026-05-30', symptoms: ['cramps'] }, // before the first record
    { date: '2026-06-11', symptoms: [] }, // no symptoms
  ];

  it('counts symptom days, rates and phase splits', () => {
    const summary = summarizeSymptomPatterns(days, periodStarts, 10);

    expect(summary.trackedDays).toBe(10);
    expect(summary.unphasedDays).toBe(1);
    expect(summary.patterns.map((pattern) => pattern.id)).toEqual([
      'cramps',
      'headache',
      'bloating',
      'fatigue',
    ]);

    const cramps = summary.patterns[0];
    expect(cramps.days).toBe(4);
    expect(cramps.rate).toBeCloseTo(0.4);
    expect(cramps.phaseDays).toEqual({
      menstrual: 2,
      follicular: 0,
      ovulation: 1,
      luteal: 0,
    });
    expect(cramps.phasedDays).toBe(3);
    expect(cramps.phaseShares.menstrual).toBeCloseTo(2 / 3);
    expect(cramps.phaseShares.ovulation).toBeCloseTo(1 / 3);
    expect(cramps.phaseShares.follicular).toBe(0);
    expect(cramps.dominantPhase).toBe('menstrual');
    expect(cramps.dominantShare).toBeCloseTo(2 / 3);

    // Ties resolve by PHASE_ORDER (menstrual, follicular, ovulation, luteal).
    const headache = summary.patterns[1];
    expect(headache.days).toBe(3);
    expect(headache.dominantPhase).toBe('follicular');
    expect(headache.dominantShare).toBeCloseTo(1 / 3);
  });

  it('caps the result at the requested limit', () => {
    const summary = summarizeSymptomPatterns(days, periodStarts, 10, 2);
    expect(summary.patterns.map((pattern) => pattern.id)).toEqual(['cramps', 'headache']);
  });

  it('keeps rates but leaves the phase split empty without period starts', () => {
    const summary = summarizeSymptomPatterns(days, [], 10);

    expect(summary.unphasedDays).toBe(9);
    expect(summary.patterns).toHaveLength(4);
    for (const pattern of summary.patterns) {
      expect(pattern.phasedDays).toBe(0);
      expect(pattern.dominantPhase).toBeNull();
      expect(pattern.dominantShare).toBe(0);
      expect(pattern.rate).toBeGreaterThan(0);
    }
  });

  it('returns a zero rate when nothing has been tracked', () => {
    const summary = summarizeSymptomPatterns(
      [{ date: '2026-06-01', symptoms: ['cramps'] }],
      periodStarts,
      0
    );
    expect(summary.patterns[0].rate).toBe(0);
  });

  it('returns no patterns when no symptoms were logged', () => {
    const summary = summarizeSymptomPatterns(
      [{ date: '2026-06-01', symptoms: [] }],
      periodStarts,
      1
    );
    expect(summary.patterns).toEqual([]);
  });
});
