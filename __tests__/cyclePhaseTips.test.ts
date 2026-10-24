import {
  CYCLE_PHASE_TIPS,
  getCurrentPhaseStatus,
  PHASE_ORDER,
  PhaseTipCategory,
} from '@/services/CyclePhaseTips';

describe('getCurrentPhaseStatus', () => {
  it('returns null when no period starts are recorded', () => {
    expect(getCurrentPhaseStatus('2026-10-20', [])).toBeNull();
  });

  it('returns null when all period starts are in the future', () => {
    expect(getCurrentPhaseStatus('2026-10-20', ['2026-10-25'])).toBeNull();
  });

  it('calculates cycle day 1 and menstrual phase on period start day', () => {
    const status = getCurrentPhaseStatus('2026-10-20', ['2026-10-20']);
    expect(status).toEqual({
      phase: 'menstrual',
      cycleDay: 1,
      daysSinceLastPeriod: 0,
    });
  });

  it('identifies follicular phase on cycle day 10', () => {
    const status = getCurrentPhaseStatus('2026-10-20', ['2026-10-11']);
    expect(status).toEqual({
      phase: 'follicular',
      cycleDay: 10,
      daysSinceLastPeriod: 9,
    });
  });

  it('identifies ovulation phase on cycle day 15', () => {
    const status = getCurrentPhaseStatus('2026-10-20', ['2026-10-06']);
    expect(status).toEqual({
      phase: 'ovulation',
      cycleDay: 15,
      daysSinceLastPeriod: 14,
    });
  });

  it('identifies luteal phase on cycle day 22', () => {
    const status = getCurrentPhaseStatus('2026-10-20', ['2026-09-29']);
    expect(status).toEqual({
      phase: 'luteal',
      cycleDay: 22,
      daysSinceLastPeriod: 21,
    });
  });

  it('uses the most recent period start before or on today', () => {
    const periodStarts = ['2026-08-01', '2026-08-29', '2026-09-26', '2026-11-01'];
    const status = getCurrentPhaseStatus('2026-10-20', periodStarts);
    expect(status).toEqual({
      // The next recorded start (Nov 1) anchors ovulation on Oct 18, so the
      // shared model keeps today inside the ovulation phase.
      phase: 'ovulation',
      cycleDay: 25,
      daysSinceLastPeriod: 24,
    });
  });

  it('follows the predicted ovulation for a longer cycle instead of fixed day-17 cutoffs', () => {
    // 30-day cycles put ovulation on day 17, so the ovulation phase still
    // covers cycle day 18. Fixed thresholds used to call this luteal.
    const status = getCurrentPhaseStatus('2026-10-18', ['2026-09-01', '2026-10-01']);
    expect(status).toEqual({
      phase: 'ovulation',
      cycleDay: 18,
      daysSinceLastPeriod: 17,
    });
  });

  it('uses a recorded ovulation day for the current cycle', () => {
    // The prediction would put ovulation on Oct 17; the recorded mark on
    // Oct 18 keeps the ovulation phase through Oct 20.
    const status = getCurrentPhaseStatus(
      '2026-10-20',
      ['2026-09-01', '2026-10-01'],
      ['2026-10-18']
    );
    expect(status).toEqual({
      phase: 'ovulation',
      cycleDay: 20,
      daysSinceLastPeriod: 19,
    });
  });
});

describe('CYCLE_PHASE_TIPS', () => {
  const categories: PhaseTipCategory[] = ['nutrition', 'movement', 'wellness', 'mindset'];

  it('defines comprehensive content for all four phases in PHASE_ORDER', () => {
    expect(PHASE_ORDER).toEqual(['menstrual', 'follicular', 'ovulation', 'luteal']);

    for (const phase of PHASE_ORDER) {
      const info = CYCLE_PHASE_TIPS[phase];
      expect(info).toBeDefined();
      expect(info.phase).toBe(phase);
      expect(info.title.length).toBeGreaterThan(0);
      expect(info.dayRange.length).toBeGreaterThan(0);
      expect(info.tagline.length).toBeGreaterThan(0);
      expect(info.summary.length).toBeGreaterThan(0);
      expect(info.hormones.length).toBeGreaterThan(0);

      expect(info.tips).toHaveLength(4);
      expect(info.tips.map((t) => t.category)).toEqual(categories);

      for (const tip of info.tips) {
        expect(tip.title.length).toBeGreaterThan(0);
        expect(tip.description.length).toBeGreaterThan(0);
        expect(tip.iconEmoji.length).toBeGreaterThan(0);
        expect(tip.categoryLabel).toBe(tip.category.toUpperCase());
      }
    }
  });
});
