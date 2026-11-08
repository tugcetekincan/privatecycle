import {
  CYCLE_PHASE_TIPS,
  getCurrentPhaseStatus,
  PHASE_ORDER,
  PhaseTipCategory,
  TODAY_FOCUS,
  UNCERTAIN_PHASE_FOCUS,
} from '@/services/CyclePhaseTips';
import { buildCycleModel, expectedPeriodLabel, phaseForDateInWindows } from '@/services/CycleModel';
import { computeFertilityForecast } from '@/services/FertilityService';
import { parseDateKey } from '@/services/dateKey';

describe('getCurrentPhaseStatus', () => {
  const auditStarts = ['2026-08-28', '2026-09-25'];

  it('keeps an overdue cycle anchored to the recorded start', () => {
    expect(getCurrentPhaseStatus('2026-11-01', auditStarts)).toMatchObject({
      start: '2026-09-25', cycleDay: 38, phase: null,
      expectedPeriodStart: '2026-10-23', daysUntilExpected: -9, timing: 'overdue',
    });
  });

  it('does not start menstruation at a predicted boundary', () => {
    expect(getCurrentPhaseStatus('2026-11-01', [...auditStarts, '2026-10-10'])).toMatchObject({
      start: '2026-10-10', cycleDay: 23, phase: null,
      expectedPeriodStart: '2026-11-01', daysUntilExpected: 0, timing: 'expected',
    });
    expect(getCurrentPhaseStatus('2026-10-31', [...auditStarts, '2026-10-10'])).toMatchObject({
      phase: 'luteal', timing: 'upcoming', daysUntilExpected: 1,
    });
  });

  it('stays available beyond the forecast horizon without inventing a phase', () => {
    const today = parseDateKey('2027-06-01');
    const model = buildCycleModel({ periodStarts: auditStarts, ovulationDays: [], today });
    expect(model.currentCycle).toMatchObject({ start: '2026-09-25', phase: null, timing: 'overdue' });
    expect(model.windows.filter((window) => window.isCurrent).map((window) => window.start)).toEqual(['2026-09-25']);
    expect(getCurrentPhaseStatus('2027-06-01', auditStarts)?.cycleDay).toBeGreaterThan(200);
  });

  it('keeps late recorded ovulation in the open cycle without claiming a phase', () => {
    const input = {
      periodStarts: auditStarts, ovulationDays: ['2026-10-28', '2026-11-03'],
      today: parseDateKey('2026-11-01'),
    };
    const model = buildCycleModel(input);
    expect(model.currentCycleOvulation).toBe('2026-10-28');
    expect(computeFertilityForecast(input).currentCycleOvulation).toBe('2026-10-28');
    expect(model.currentCycle?.phase).toBeNull();
    expect(phaseForDateInWindows('2026-10-28', model.windows)).toBeNull();
  });

  it('resets only after a new recorded period and handles year rollover', () => {
    const starts = ['2026-11-05', '2026-12-03'];
    expect(getCurrentPhaseStatus('2027-01-01', starts)).toMatchObject({
      cycleDay: 30, phase: null, expectedPeriodStart: '2026-12-31', daysUntilExpected: -1,
    });
    expect(getCurrentPhaseStatus('2027-01-01', [...starts, '2027-01-01'])).toMatchObject({
      cycleDay: 1, phase: 'menstrual', timing: 'upcoming',
    });
  });

  it('never describes an overdue date as today', () => {
    expect(expectedPeriodLabel(-9)).toBe('Expected 9 days ago');
    expect(expectedPeriodLabel(-1)).toBe('Expected 1 day ago');
    expect(expectedPeriodLabel(0)).toBe('Expected today');
    expect(expectedPeriodLabel(1)).toBe('Expected in 1 day');
  });

  it('uses calendar days rather than the current time of day for status', () => {
    const model = buildCycleModel({
      periodStarts: auditStarts, ovulationDays: [], today: new Date(2026, 9, 23, 23, 59),
    });
    expect(model.currentCycle).toMatchObject({ cycleDay: 29, daysUntilExpected: 0, timing: 'expected', phase: null });
  });

  it('returns null when no period starts are recorded', () => {
    expect(getCurrentPhaseStatus('2026-10-20', [])).toBeNull();
  });

  it('returns null when all period starts are in the future', () => {
    expect(getCurrentPhaseStatus('2026-10-20', ['2026-10-25'])).toBeNull();
  });

  it('calculates cycle day 1 and menstrual phase on period start day', () => {
    const status = getCurrentPhaseStatus('2026-10-20', ['2026-10-20']);
    expect(status).toMatchObject({
      phase: 'menstrual',
      cycleDay: 1,
      daysSinceLastPeriod: 0,
    });
  });

  it('identifies follicular phase on cycle day 10', () => {
    const status = getCurrentPhaseStatus('2026-10-20', ['2026-10-11']);
    expect(status).toMatchObject({
      phase: 'follicular',
      cycleDay: 10,
      daysSinceLastPeriod: 9,
    });
  });

  it('identifies ovulation phase on cycle day 15', () => {
    const status = getCurrentPhaseStatus('2026-10-20', ['2026-10-06']);
    expect(status).toMatchObject({
      phase: 'ovulation',
      cycleDay: 15,
      daysSinceLastPeriod: 14,
    });
  });

  it('identifies luteal phase on cycle day 22', () => {
    const status = getCurrentPhaseStatus('2026-10-20', ['2026-09-29']);
    expect(status).toMatchObject({
      phase: 'luteal',
      cycleDay: 22,
      daysSinceLastPeriod: 21,
    });
  });

  it('uses the most recent period start before or on today', () => {
    const periodStarts = ['2026-08-01', '2026-08-29', '2026-09-26', '2026-11-01'];
    const status = getCurrentPhaseStatus('2026-10-20', periodStarts);
    expect(status).toMatchObject({
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
    expect(status).toMatchObject({
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
    expect(status).toMatchObject({
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

  it('defines a curated Today focus for every phase', () => {
    for (const phase of PHASE_ORDER) {
      const focus = TODAY_FOCUS[phase];
      expect(focus.emoji.length).toBeGreaterThan(0);
      expect(focus.title.length).toBeGreaterThan(0);
      expect(focus.description.length).toBeGreaterThan(0);
    }
  });

  it('keeps a neutral focus available when the current phase is uncertain', () => {
    expect(UNCERTAIN_PHASE_FOCUS.title).toBe('Let your body set the pace');
    expect(UNCERTAIN_PHASE_FOCUS.emoji).toBeTruthy();
    expect(UNCERTAIN_PHASE_FOCUS.description).toContain('how you feel today');
  });
});
