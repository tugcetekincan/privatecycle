import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import OverviewTab from '@/app/(tabs)/track';
import InsightsTab from '@/app/(tabs)/insights';
import { ThemeProvider } from '@/hooks/useTheme';
import { DataService, DailyData } from '@/services/DataService';
import { summarizePeriodDays } from '@/services/BleedingModel';
import { addDays, formatDateKey } from '@/services/dateKey';
import { MoodDay, MoodSeriesPoint } from '@/services/MoodInsights';

jest.setTimeout(15000);

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
  router: { navigate: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

const today = new Date();
const todayKey = formatDateKey(today);
const startKey = formatDateKey(addDays(today, -10));
const periodDays = [0, 1, 2].map((offset) => formatDateKey(addDays(today, -10 + offset)));

const emptySeries = (): MoodSeriesPoint[] =>
  Array.from({ length: 60 }, (_, index) => ({
    date: formatDateKey(addDays(today, index - 59)),
    valence: 0,
    isPeriod: false,
  }));

const ratedSeries = (ratings: number[]): MoodSeriesPoint[] => {
  const series = emptySeries();
  ratings.forEach((valence, index) => {
    series[series.length - ratings.length + index] = {
      ...series[series.length - ratings.length + index],
      valence,
    };
  });
  return series;
};

const emptyInsights = (overrides: Record<string, unknown> = {}) => ({
  periodLength: summarizePeriodDays([], todayKey),
  nextPeriodIn: 0,
  totalPeriods: 0,
  moodSeries: emptySeries(),
  moodPhases: [],
  recentMoods: [],
  periodStarts: [],
  ovulationDays: [],
  symptomPatterns: [],
  trackedDays: 0,
  ...overrides,
});

const oneStartInsights = () => ({
  ...emptyInsights(),
  periodLength: summarizePeriodDays(periodDays, todayKey),
  periodStarts: [startKey],
  totalPeriods: 1,
  trackedDays: 3,
});

const renderOverview = () =>
  render(
    <ThemeProvider>
      <OverviewTab />
    </ThemeProvider>
  );

const renderInsights = () =>
  render(
    <ThemeProvider>
      <InsightsTab />
    </ThemeProvider>
  );

describe('Overview journal states', () => {
  afterEach(() => jest.restoreAllMocks());

  it('replaces the dashboard with one start card on a truly empty journal', async () => {
    jest.spyOn(DataService, 'getInsights').mockResolvedValue(emptyInsights() as any);
    jest.spyOn(DataService, 'getFertilityForecast').mockResolvedValue({} as any);

    const screen = renderOverview();

    expect(await screen.findByTestId('overview-cycle-start-card')).toBeTruthy();
    expect(screen.queryByTestId('overview-cycle-hero')).toBeNull();
    expect(screen.queryByTestId('overview-avg-cycle')).toBeNull();
    expect(screen.getByTestId('overview-cycle-requirements')).toBeTruthy();
    expect(screen.getByText(/consecutive bleeding days count as one start/)).toBeTruthy();
    expect(screen.getByTestId('overview-start-period')).toBeTruthy();
    expect(screen.getByTestId('overview-import-backup')).toBeTruthy();
    expect(screen.getByText('Make a note of how you feel')).toBeTruthy();
    expect(screen.getByText('Your moods belong here too')).toBeTruthy();
    expect(screen.getByText(/5 overall-rated days within 60 days/)).toBeTruthy();
    expect(screen.getAllByTestId('overview-symptom-log-today')).toHaveLength(1);
    expect(screen.getAllByTestId('overview-mood-log-today')).toHaveLength(1);
  });

  it('acknowledges moods and symptoms without adding the empty requirements list', async () => {
    jest.spyOn(DataService, 'getInsights').mockResolvedValue(
      emptyInsights({
        trackedDays: 3,
        recentMoods: [
          { date: todayKey, valence: 3, tags: [{ id: 'calm', level: 1 }] },
        ] as MoodDay[],
      }) as any
    );
    jest.spyOn(DataService, 'getFertilityForecast').mockResolvedValue({} as any);

    const screen = renderOverview();

    expect(await screen.findByTestId('overview-cycle-start-card')).toBeTruthy();
    expect(screen.getByText(/logged symptoms and moods already count/)).toBeTruthy();
    expect(screen.queryByTestId('overview-cycle-requirements')).toBeNull();
    expect(screen.getByTestId('overview-mood-recent-' + todayKey)).toBeTruthy();
  });

  it('keeps one-start values honest with contextual hints and an empty chart', async () => {
    jest.spyOn(DataService, 'getInsights').mockResolvedValue(oneStartInsights() as any);
    jest.spyOn(DataService, 'getFertilityForecast').mockResolvedValue({} as any);

    const screen = renderOverview();

    expect(await screen.findByTestId('overview-cycle-hero')).toBeTruthy();
    expect(screen.getByTestId('overview-avg-cycle').props.children).toBe('—');
    expect(screen.getByTestId('overview-avg-cycle-hint').props.children).toBe(
      '1 more period start'
    );
    expect(screen.getByTestId('overview-typical-period').props.children).toBe('—');
    expect(screen.getByTestId('overview-variation-hint').props.children).toBe(
      '2 more period starts'
    );
    expect(screen.getByTestId('overview-last-period').props.children).toBe(3);
    expect(screen.getByTestId('overview-cycle-chart-meta').props.children).toBe(
      '1 start'
    );
    expect(screen.getByTestId('overview-cycle-chart-empty')).toBeTruthy();
    expect(screen.getByText(/completes your first cycle/)).toBeTruthy();
    expect(screen.getByTestId('overview-cycle-chart-open-calendar')).toBeTruthy();
  });

  it('does not imply missing period history for unphased symptoms with a recorded start', async () => {
    const symptom = {
      id: 'headache',
      days: 1,
      rate: 1 / 3,
      phaseDays: { menstrual: 0, follicular: 0, ovulation: 0, luteal: 0 },
      phaseShares: { menstrual: 0, follicular: 0, ovulation: 0, luteal: 0 },
      phasedDays: 0,
      dominantPhase: null,
      dominantShare: 0,
    };
    jest.spyOn(DataService, 'getInsights').mockResolvedValue({
      ...oneStartInsights(),
      trackedDays: 3,
      symptomPatterns: [symptom],
    } as any);
    jest.spyOn(DataService, 'getFertilityForecast').mockResolvedValue({} as any);

    const screen = renderOverview();

    expect(await screen.findByTestId('overview-symptom-context-note')).toBeTruthy();
    expect(
      screen.getByTestId('overview-symptom-context-note').props.children
    ).toContain("don't have an estimated phase");
    expect(
      screen.getByTestId('overview-symptom-context-note').props.children
    ).not.toContain('Period history adds');
  });

  it('shows tags-only entries without a fabricated rating or trend progress', async () => {
    const recentMoods: MoodDay[] = [
      { date: formatDateKey(addDays(today, -1)), valence: 0, tags: [{ id: 'calm', level: 1 }] },
      { date: todayKey, valence: 0, tags: [{ id: 'tired', level: 2 }] },
    ];
    jest.spyOn(DataService, 'getInsights').mockResolvedValue(
      emptyInsights({ trackedDays: 2, recentMoods }) as any
    );
    jest.spyOn(DataService, 'getFertilityForecast').mockResolvedValue({} as any);

    const screen = renderOverview();

    expect(await screen.findByTestId('overview-mood-recent-' + recentMoods[0].date)).toBeTruthy();
    expect(
      screen.getByTestId(`overview-mood-recent-${recentMoods[0].date}-no-rating`)
    ).toBeTruthy();
    expect(screen.queryByTestId('overview-mood-trend')).toBeNull();
    expect(screen.getByTestId('overview-mood-trend-progress').props.children).toBe(
      '0 of 5 rated days in the last 60 days · 5 more for a trend'
    );
    expect(screen.getByTestId('overview-mood-phase-context')).toBeTruthy();
    (router.navigate as jest.Mock).mockClear();
    fireEvent.press(screen.getByTestId('overview-mood-log-today'));
    expect(router.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ calendarIntent: 'today' }),
      })
    );
    expect(screen.getAllByTestId('overview-mood-log-today')).toHaveLength(1);
  });

  it('shows legacy mood text without a rating or invented strength', async () => {
    const recentMoods: MoodDay[] = [
      {
        date: todayKey,
        valence: 0,
        tags: [],
        legacyMood: 'happy',
      },
    ];
    jest.spyOn(DataService, 'getInsights').mockResolvedValue(
      emptyInsights({ trackedDays: 1, recentMoods }) as any
    );
    jest.spyOn(DataService, 'getFertilityForecast').mockResolvedValue({} as any);

    const screen = renderOverview();

    expect(await screen.findByTestId(`overview-mood-recent-${todayKey}`)).toBeTruthy();
    expect(screen.getByTestId(`overview-mood-recent-${todayKey}-no-rating`)).toBeTruthy();
    expect(screen.getByTestId(`overview-mood-recent-${todayKey}-legacy`)).toBeTruthy();
    expect(screen.queryByTestId(`overview-mood-recent-${todayKey}-rating`)).toBeNull();
    expect(screen.getByTestId('overview-mood-trend-progress').props.children).toBe(
      '0 of 5 rated days in the last 60 days · 5 more for a trend'
    );
  });

  it('shows three ratings with exact progress toward the trend', async () => {
    const recentMoods: MoodDay[] = [3, 4, 2].map((valence, index) => ({
      date: formatDateKey(addDays(today, index - 2)),
      valence,
      tags: [{ id: 'tired', level: 1 }],
    }));
    jest.spyOn(DataService, 'getInsights').mockResolvedValue(
      emptyInsights({
        trackedDays: 3,
        recentMoods,
        moodSeries: ratedSeries([3, 4, 2]),
      }) as any
    );
    jest.spyOn(DataService, 'getFertilityForecast').mockResolvedValue({} as any);

    const screen = renderOverview();

    expect(await screen.findByTestId('overview-mood-trend-progress')).toBeTruthy();
    expect(screen.getByTestId('overview-mood-trend-progress').props.children).toBe(
      '3 of 5 rated days in the last 60 days · 2 more for a trend'
    );
    expect(screen.queryByTestId('overview-mood-trend')).toBeNull();
    expect(screen.getByTestId('overview-mood-meta').props.children).toBe(
      'Recent entries'
    );
    expect(screen.getByTestId('overview-mood-log-today')).toBeTruthy();
  });

  it('labels a five-rating trend truthfully when no phases exist', async () => {
    const recentMoods: MoodDay[] = [2, 3, 4, 5, 4].map((valence, index) => ({
      date: formatDateKey(addDays(today, index - 4)),
      valence,
      tags: [],
    }));
    jest.spyOn(DataService, 'getInsights').mockResolvedValue(
      emptyInsights({
        trackedDays: 5,
        recentMoods,
        moodSeries: ratedSeries([2, 3, 4, 5, 4]),
      }) as any
    );
    jest.spyOn(DataService, 'getFertilityForecast').mockResolvedValue({} as any);

    const screen = renderOverview();

    expect(await screen.findByTestId('overview-mood-trend')).toBeTruthy();
    expect(screen.getByTestId('overview-mood-meta').props.children).toBe('Trend');
    expect(screen.queryByTestId('overview-mood-trend-progress')).toBeNull();
    expect(screen.getByTestId('overview-mood-phase-context')).toBeTruthy();
    expect(screen.getByTestId('overview-mood-phase-context').props.children).toContain(
      'needs a recorded period start'
    );
    expect(screen.getByTestId('overview-mood-log-today')).toBeTruthy();
  });
});

describe('Insights journal states', () => {
  afterEach(() => jest.restoreAllMocks());

  const todayLog = (overrides: Partial<DailyData> = {}): DailyData => ({
    date: todayKey,
    isPeriod: false,
    flowLevel: '',
    symptoms: [],
    mood: '',
    isOvulation: false,
    moodValence: 0,
    moodTags: [],
    ...overrides,
  });

  it('renders today’s headache tip without period history', async () => {
    jest.spyOn(DataService, 'getInsights').mockResolvedValue(
      emptyInsights({
        trackedDays: 1,
        symptomPatterns: [
          {
            id: 'headache',
            days: 1,
            rate: 1,
            phaseDays: { menstrual: 0, follicular: 0, ovulation: 0, luteal: 0 },
            phaseShares: { menstrual: 0, follicular: 0, ovulation: 0, luteal: 0 },
            phasedDays: 0,
            dominantPhase: null,
            dominantShare: 0,
          },
        ],
      }) as any
    );
    jest
      .spyOn(DataService, 'getTodayData')
      .mockResolvedValue(todayLog({ symptoms: ['headache'] }));

    const screen = renderInsights();

    expect(await screen.findByTestId('insights-today-tips')).toBeTruthy();
    expect(
      screen.getByText('Keep water and meals regular, and rest your eyes when you can.')
    ).toBeTruthy();
    expect(screen.getByText('Headache logged')).toBeTruthy();
    expect(screen.getByTestId('insights-today-phase-note')).toBeTruthy();
    expect(screen.getByText(/no period start logged/)).toBeTruthy();
    expect(screen.getByTestId('insights-edit-today')).toBeTruthy();
    expect(screen.getByTestId('insights-patterns-empty')).toBeTruthy();
    expect(screen.getByTestId('insights-patterns-requirements')).toBeTruthy();
    expect(screen.queryByText(/after a few cycles/i)).toBeNull();
    expect(screen.getByText(/3 period starts/)).toBeTruthy();
    expect(screen.queryByTestId('insights-patterns-open-calendar')).toBeNull();
    expect(screen.getByTestId('insights-patterns-add-period')).toBeTruthy();
  });

  it('acknowledges a rated day with no phase tip instead of claiming no entries', async () => {
    jest.spyOn(DataService, 'getInsights').mockResolvedValue(
      emptyInsights({ trackedDays: 1 }) as any
    );
    jest
      .spyOn(DataService, 'getTodayData')
      .mockResolvedValue(todayLog({ moodValence: 4, moodTags: [] }));

    const screen = renderInsights();

    expect(await screen.findByTestId('insights-today-logged')).toBeTruthy();
    expect(screen.getByText('Mood 4/5 logged')).toBeTruthy();
    expect(screen.getByText(/You rated your overall mood 4\/5/)).toBeTruthy();
    expect(screen.queryByTestId('insights-today-empty')).toBeNull();
    expect(screen.queryByTestId('insights-today-tips')).toBeNull();
  });

  it('acknowledges a legacy mood-only row without a fabricated rating', async () => {
    jest.spyOn(DataService, 'getInsights').mockResolvedValue(
      emptyInsights({ trackedDays: 1 }) as any
    );
    jest
      .spyOn(DataService, 'getTodayData')
      .mockResolvedValue(todayLog({ mood: 'happy' }));

    const screen = renderInsights();

    expect(await screen.findByTestId('insights-today-logged')).toBeTruthy();
    expect(screen.getByText('Mood logged')).toBeTruthy();
    expect(
      screen.getByText(/Your saved feeling is Happy. No overall rating was recorded/)
    ).toBeTruthy();
    expect(screen.queryByText(/Mood 1\/5/)).toBeNull();
  });

  it('acknowledges a flow-only row as a saved note without a period', async () => {
    jest.spyOn(DataService, 'getInsights').mockResolvedValue(
      emptyInsights({ trackedDays: 1 }) as any
    );
    jest
      .spyOn(DataService, 'getTodayData')
      .mockResolvedValue(todayLog({ flowLevel: 'light' }));

    const screen = renderInsights();

    expect(await screen.findByTestId('insights-today-logged')).toBeTruthy();
    expect(screen.getByText('Flow noted')).toBeTruthy();
    expect(screen.getByText(/Your flow note is saved/)).toBeTruthy();
    expect(screen.queryByText('Period logged')).toBeNull();
  });

  it('offers a small first step on a truly empty Today card', async () => {
    jest.spyOn(DataService, 'getInsights').mockResolvedValue(emptyInsights() as any);
    jest.spyOn(DataService, 'getTodayData').mockResolvedValue(null);

    const screen = renderInsights();

    expect(await screen.findByTestId('insights-today-empty')).toBeTruthy();
    expect(screen.getByText('Begin with a small note')).toBeTruthy();
    expect(screen.getByTestId('insights-log-today')).toBeTruthy();
    expect(screen.getByTestId('insights-start-period')).toBeTruthy();
    expect(screen.getByTestId('insights-patterns-import')).toBeTruthy();
    expect(screen.getByTestId('insights-patterns-add-period')).toBeTruthy();
    expect(screen.queryByTestId('insights-patterns-open-calendar')).toBeNull();
    expect(screen.getByText(/General guide — no current phase is assumed/)).toBeTruthy();
  });
});
