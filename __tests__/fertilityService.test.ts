import {
  averageCycleLength,
  computeFertilityForecast,
  predictPeriodStarts,
} from '@/services/FertilityService';
import { buildCycleModel, phaseForDateInWindows } from '@/services/CycleModel';
import { addDays, daysBetween, formatDateKey, isAfterToday, parseDateKey } from '@/services/dateKey';

/** Local-midnight day key offset from a start key. */
const day = (start: string, offset: number): string =>
  formatDateKey(addDays(parseDateKey(start), offset));

describe('dateKey helpers', () => {
  it('round-trips local dates without timezone shifts', () => {
    const parsed = parseDateKey('2026-03-01');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(2);
    expect(parsed.getDate()).toBe(1);
    expect(formatDateKey(parsed)).toBe('2026-03-01');
  });

  it('counts whole days between local midnights', () => {
    expect(daysBetween(parseDateKey('2026-03-01'), parseDateKey('2026-03-29'))).toBe(28);
  });

  it('flags only local calendar days after today', () => {
    const now = new Date(2026, 9, 30, 23, 59);
    expect(isAfterToday(parseDateKey('2026-10-31'), now)).toBe(true);
    expect(isAfterToday(parseDateKey('2026-11-01'), now)).toBe(true);
    expect(isAfterToday(parseDateKey('2026-10-30'), now)).toBe(false);
    expect(isAfterToday(new Date(2026, 9, 30, 0, 1), now)).toBe(false);
    expect(isAfterToday(parseDateKey('2026-10-29'), now)).toBe(false);
  });
});

describe('averageCycleLength', () => {
  it('defaults to 28 without observed cycles', () => {
    expect(averageCycleLength([])).toBe(28);
    expect(averageCycleLength(['2026-01-05'])).toBe(28);
  });

  it('averages consecutive period starts', () => {
    expect(averageCycleLength(['2026-01-05', '2026-02-02', '2026-03-01'])).toBeCloseTo(27.5);
  });
});

describe('predictPeriodStarts', () => {
  it('returns nothing without a recorded period', () => {
    expect(predictPeriodStarts([])).toEqual([]);
  });

  it('uses a flat 28-day spacing after a single recorded period', () => {
    const predictions = predictPeriodStarts(['2026-01-05']);
    expect(predictions).toHaveLength(6);
    expect(predictions[0]).toBe('2026-02-02');
    expect(predictions[5]).toBe('2026-06-22');
  });

  it('anchors the first prediction on the observed average and is deterministic', () => {
    const starts = ['2026-01-05', '2026-02-02'];
    const first = predictPeriodStarts(starts);
    const second = predictPeriodStarts(starts);
    expect(first).toEqual(second);
    expect(first[0]).toBe('2026-03-02'); // Jan 5 + 28 days
    expect([...first].sort()).toEqual(first); // ascending
  });
});

describe('computeFertilityForecast', () => {
  it('falls back to a standard 14-day luteal phase without records', () => {
    const forecast = computeFertilityForecast({
      periodStarts: ['2026-01-05'],
      ovulationDays: [],
      today: parseDateKey('2026-01-10'),
    });

    expect(forecast.stats.basis).toBe('standard');
    expect(forecast.stats.averageLutealLength).toBeNull();
    expect(forecast.futurePeriodStarts[0]).toBe('2026-02-02');
    expect(forecast.cycles[0]).toEqual({
      periodStart: '2026-02-02',
      ovulationDate: '2026-01-19',
      windowStart: '2026-01-14',
      windowEnd: '2026-01-19',
      isCurrentCycle: true,
    });
  });

  it('personalizes from recorded luteal lengths (ovulation -> next period)', () => {
    // Luteal gaps: Jan 17 -> Feb 2 = 16 days, Feb 15 -> Mar 1 = 14 days.
    const forecast = computeFertilityForecast({
      periodStarts: ['2026-01-05', '2026-02-02', '2026-03-01'],
      ovulationDays: ['2026-01-17', '2026-02-15'],
      today: parseDateKey('2026-03-02'),
    });

    expect(forecast.stats.basis).toBe('recorded');
    expect(forecast.stats.averageLutealLength).toBe(15);
    // Next predicted period: Mar 1 + round(27.5) = Mar 29; minus 15 = Mar 14.
    expect(forecast.cycles[0].ovulationDate).toBe('2026-03-14');
    expect(forecast.cycles[0].windowStart).toBe('2026-03-09');
    expect(forecast.cycles[0].isCurrentCycle).toBe(true);
  });

  it('lets a recorded ovulation in the current cycle beat the prediction', () => {
    const forecast = computeFertilityForecast({
      periodStarts: ['2026-01-05'],
      ovulationDays: ['2026-01-17'],
      today: parseDateKey('2026-01-20'),
    });

    expect(forecast.currentCycleOvulation).toBe('2026-01-17');
    // Current-cycle forecast is suppressed; the next visible one ends the following cycle.
    expect(forecast.cycles[0].isCurrentCycle).toBe(false);
    expect(forecast.cycles[0].periodStart).toBe('2026-03-02');
    expect(forecast.cycles[0].ovulationDate).toBe('2026-02-16');
  });

  it('ignores implausible luteal gaps instead of poisoning the average', () => {
    const forecast = computeFertilityForecast({
      periodStarts: ['2026-01-05', '2026-02-02'],
      ovulationDays: ['2026-01-31'], // 2 days before the next period
      today: parseDateKey('2026-01-10'),
    });

    expect(forecast.stats.basis).toBe('standard');
    expect(forecast.stats.averageLutealLength).toBeNull();
  });

  it('uses the latest ovulation mark when a cycle has several', () => {
    const forecast = computeFertilityForecast({
      periodStarts: ['2026-01-05', '2026-02-02'],
      ovulationDays: ['2026-01-10', '2026-01-20'], // Jan 20 -> Feb 2 = 13 days
      today: parseDateKey('2026-01-10'),
    });

    expect(forecast.stats.averageLutealLength).toBe(13);
  });

  it('ignores future ovulation marks when analyzing the current cycle', () => {
    const forecast = computeFertilityForecast({
      periodStarts: ['2026-01-05'],
      ovulationDays: ['2026-02-10'],
      today: parseDateKey('2026-01-20'),
    });

    expect(forecast.currentCycleOvulation).toBeNull();
  });

  it('drops forecasts whose fertile window has fully passed', () => {
    const forecast = computeFertilityForecast({
      periodStarts: ['2026-01-05'],
      ovulationDays: [],
      today: parseDateKey('2026-01-25'), // Jan 19 window already over
    });

    expect(forecast.cycles[0].periodStart).toBe('2026-03-02');
    expect(forecast.cycles[0].ovulationDate).toBe('2026-02-16');
  });

  it('keeps a forecast that includes today', () => {
    const forecast = computeFertilityForecast({
      periodStarts: ['2026-01-05'],
      ovulationDays: [],
      today: parseDateKey('2026-01-19'), // window ends today
    });

    expect(forecast.cycles[0].ovulationDate).toBe('2026-01-19');
  });

  it('returns an empty forecast without period data', () => {
    const forecast = computeFertilityForecast({
      periodStarts: [],
      ovulationDays: [day('2026-01-05', 3)],
      today: parseDateKey('2026-01-20'),
    });

    expect(forecast.futurePeriodStarts).toEqual([]);
    expect(forecast.cycles).toEqual([]);
    expect(forecast.currentCycleOvulation).toBeNull();
    expect(forecast.stats.averageCycleLength).toBe(28);
  });
});

describe('cycle windows', () => {
  // 30-day cycles: Jan 5 -> Feb 4 -> Mar 6 (predicted).
  const starts = ['2026-01-05', '2026-02-04'];

  it('aligns the ovulation phase with a 12-day luteal forecast', () => {
    // Jan 23 -> Feb 4 = 12 days, so Mar 6 minus 12 = Feb 22.
    const model = buildCycleModel({
      periodStarts: starts,
      ovulationDays: ['2026-01-23'],
      today: parseDateKey('2026-02-04'),
    });

    expect(model.averageLutealLength).toBe(12);
    const open = model.windows.find((window) => window.start === '2026-02-04');
    expect(open?.ovulationDate).toBe('2026-02-22');
    expect(open?.ovulationRecorded).toBe(false);
    expect(phaseForDateInWindows('2026-02-21', model.windows)).toBe('follicular');
    expect(phaseForDateInWindows('2026-02-22', model.windows)).toBe('ovulation');
    expect(phaseForDateInWindows('2026-02-24', model.windows)).toBe('ovulation');
    expect(phaseForDateInWindows('2026-02-25', model.windows)).toBe('luteal');
  });

  it('aligns the ovulation phase with a 17-day luteal forecast', () => {
    const model = buildCycleModel({
      periodStarts: starts,
      ovulationDays: ['2026-01-18'], // 17 days before Feb 4
      today: parseDateKey('2026-02-04'),
    });

    expect(model.averageLutealLength).toBe(17);
    expect(phaseForDateInWindows('2026-02-16', model.windows)).toBe('follicular');
    expect(phaseForDateInWindows('2026-02-17', model.windows)).toBe('ovulation');
  });

  it('uses a recorded ovulation in the open cycle', () => {
    const model = buildCycleModel({
      periodStarts: starts,
      ovulationDays: ['2026-01-23', '2026-02-22'],
      today: parseDateKey('2026-03-01'),
    });

    const open = model.windows.find((window) => window.start === '2026-02-04');
    expect(open?.ovulationRecorded).toBe(true);
    expect(model.currentCycleOvulation).toBe('2026-02-22');
    expect(phaseForDateInWindows('2026-02-22', model.windows)).toBe('ovulation');
  });

  it('ignores future-dated ovulation marks for the open cycle', () => {
    const model = buildCycleModel({
      periodStarts: starts,
      ovulationDays: ['2026-01-23', '2026-02-28'],
      today: parseDateKey('2026-02-10'),
    });

    const open = model.windows.find((window) => window.start === '2026-02-04');
    expect(open?.ovulationRecorded).toBe(false);
    expect(open?.ovulationDate).toBe('2026-02-22');
    expect(model.currentCycleOvulation).toBeNull();
  });

  it('keeps every forecast ovulation inside its ovulation phase', () => {
    const periodStarts = ['2026-01-05', '2026-02-02', '2026-03-01'];
    const ovulationDays = ['2026-01-17', '2026-02-15'];
    const today = parseDateKey('2026-03-02');

    const forecast = computeFertilityForecast({ periodStarts, ovulationDays, today });
    const model = buildCycleModel({ periodStarts, ovulationDays, today });

    expect(forecast.cycles.length).toBeGreaterThan(0);
    for (const cycle of forecast.cycles) {
      const window = model.windows.find((candidate) => candidate.end === cycle.periodStart)!;
      expect(cycle.ovulationDate >= window.ovulationPhaseStart).toBe(true);
      expect(cycle.ovulationDate <= window.ovulationPhaseEnd).toBe(true);
      if (window.predictedStart) {
        expect(phaseForDateInWindows(cycle.ovulationDate, model.windows)).toBeNull();
      }
    }
  });
});
