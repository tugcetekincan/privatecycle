import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { TrendingUp } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { emptyBleedingSummary, toPeriodRunContext } from '@/services/BleedingModel';
import { DataService } from '@/services/DataService';
import {
  buildCycleModel,
  expectedPeriodLabel,
  CyclePhase,
  PHASE_LABELS,
} from '@/services/CycleModel';
import {
  buildCycleLengthPoints,
  CYCLE_HISTORY_LIMIT,
  phaseTrackSegments,
  summarizeCycleLengths,
} from '@/services/CycleTrends';
import { getCurrentPhaseStatus } from '@/services/CyclePhaseTips';
import {
  MOOD_SERIES_DAYS,
  MoodSeriesPoint,
  PhaseMoodSummary,
} from '@/services/MoodInsights';
import { MOOD_OPTIONS } from '@/services/MoodTags';
import { SymptomPattern } from '@/services/SymptomInsights';
import { symptomMeta } from '@/services/Symptoms';
import { daysBetween, formatDateKey, parseDateKey } from '@/services/dateKey';
import { FertilityForecast } from '@/services/FertilityService';
import { useTheme } from '@/hooks/useTheme';
import ScreenHeader from '@/components/ui/ScreenHeader';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, GradientCard } from '@/components/ui/Card';
import Pill from '@/components/ui/Pill';
import EmptyState from '@/components/ui/EmptyState';
import ScreenFade from '@/components/ui/ScreenFade';
import { radii, spacing, typography } from '@/design/tokens';

// Intentional accent for ovulation marks; keeps them distinct from period pink.
const OVULATION_COLOR = '#009688';

const CHART_HEIGHT = 84;
const CHART_LABEL_HEIGHT = 18;
const CHART_VISIBLE_CYCLES = 6;
const CHART_GAP = 8;
const CHART_TOTAL_HEIGHT = CHART_HEIGHT + CHART_LABEL_HEIGHT + 24;
// Card margin (20 × 2), padding (18 × 2) and border (1 × 2) around the chart.
// Used only until onLayout reports the real width.
const CYCLE_CARD_HORIZONTAL_CHROME = 78;

type OverviewStats = Awaited<ReturnType<typeof DataService.getInsights>>;

const EMPTY_STATS: OverviewStats = {
  periodLength: emptyBleedingSummary(),
  nextPeriodIn: 0,
  totalPeriods: 0,
  moodSeries: [],
  moodPhases: [],
  periodStarts: [],
  ovulationDays: [],
  symptomPatterns: [],
  trackedDays: 0,
};

const VALENCE_FACES: { [value: number]: string } = {
  1: '😞',
  2: '😕',
  3: '😐',
  4: '🙂',
  5: '😄',
};

function moodLabel(id: string): string {
  return (
    MOOD_OPTIONS.find((option) => option.id === id)?.label ??
    id.charAt(0).toUpperCase() + id.slice(1)
  );
}

function levelDots(averageLevel: number): string {
  return '●'.repeat(Math.min(3, Math.max(1, Math.round(averageLevel))));
}

function formatPercent(rate: number): string {
  const percent = rate * 100;
  if (percent > 0 && percent < 1) return '<1%';
  return `${Math.round(percent)}%`;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

/**
 * Daily valence over the last `MOOD_SERIES_DAYS` days: period days are shaded,
 * one dot per logged day. Pure SVG so no chart dependency is needed.
 */
function MoodTrendChart({
  series,
  width,
  color,
}: {
  series: MoodSeriesPoint[];
  width: number;
  color: string;
}) {
  const height = 96;
  const padY = 12;
  const slot = series.length > 1 ? width / (series.length - 1) : width;
  const x = (index: number) => (series.length > 1 ? index * slot : width / 2);
  const y = (valence: number) => padY + ((5 - valence) / 4) * (height - padY * 2);

  const logged = series
    .map((point, index) => ({ ...point, index }))
    .filter((point) => point.valence > 0)
    .map((point) => ({ ...point, x: x(point.index), y: y(point.valence) }));

  const smoothPath = (points: { x: number; y: number }[]): string => {
    if (points.length < 2) return '';
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 0; index < points.length - 1; index++) {
      const previous = points[index - 1] ?? points[index];
      const current = points[index];
      const next = points[index + 1];
      const after = points[index + 2] ?? next;
      const cp1x = current.x + (next.x - previous.x) / 6;
      const cp1y = current.y + (next.y - previous.y) / 6;
      const cp2x = next.x - (after.x - current.x) / 6;
      const cp2y = next.y - (after.y - current.y) / 6;
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
    }
    return path;
  };

  return (
    <Svg width="100%" height={height} viewBox={`-4 -4 ${width + 8} ${height + 8}`} accessibilityLabel="Mood from rough to great over the last 60 days">
      {series.map((point, index) =>
        point.isPeriod ? (
          <Rect
            key={point.date}
            x={x(index) - slot / 2}
            y={0}
            width={slot}
            height={height}
            fill={color}
            fillOpacity={0.14}
          />
        ) : null
      )}
      {logged.length > 1 && (
        <Path
          d={smoothPath(logged)}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {logged.map((point) => (
        <Circle key={point.date} cx={point.x} cy={point.y} r={2.2} fill={color} />
      ))}
    </Svg>
  );
}

export default function OverviewTab() {
  const { theme } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [stats, setStats] = useState<OverviewStats>(EMPTY_STATS);
  const [forecast, setForecast] = useState<FertilityForecast | null>(null);
  const [measuredChartWidth, setMeasuredChartWidth] = useState(0);
  const chartScrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const lastChartScrollKey = useRef('');

  const loadOverview = useCallback(async () => {
    const [data, fertility] = await Promise.all([
      DataService.getInsights(),
      DataService.getFertilityForecast(),
    ]);
    setStats(data);
    setForecast(fertility);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOverview();
    }, [loadOverview])
  );

  const styles = createStyles(theme);
  const today = new Date();
  const todayKey = formatDateKey(today);

  const periodContext = toPeriodRunContext(stats.periodLength);
  const currentStatus = getCurrentPhaseStatus(
    todayKey,
    stats.periodStarts,
    stats.ovulationDays,
    periodContext
  );
  const model = buildCycleModel({
    periodStarts: stats.periodStarts,
    ovulationDays: stats.ovulationDays,
    today,
    ...periodContext,
  });
  const currentWindow = model.windows.find((window) => window.isCurrent) ?? null;
  const usesStandardCycleLength = model.cycleLengthBasis === 'standard';
  const segments = currentWindow && currentStatus?.phase ? phaseTrackSegments(currentWindow) : [];
  const cycleLength = currentWindow
    ? daysBetween(parseDateKey(currentWindow.start), parseDateKey(currentWindow.end))
    : null;
  const markerPercent =
    currentWindow && cycleLength && currentStatus
      ? Math.min(1, currentStatus.cycleDay / cycleLength)
      : 0;

  const cycleSummary = summarizeCycleLengths(stats.periodStarts);
  const cyclePoints = buildCycleLengthPoints(stats.periodStarts);
  const averageCycle =
    cycleSummary.average !== null ? Math.round(cycleSummary.average) : null;
  const typicalPeriodDays = stats.periodLength.typicalDays;
  const lastPeriod = stats.periodLength.lastPeriod;
  const lastPeriodDays = lastPeriod?.days ?? null;
  const lastPeriodActive = lastPeriod?.active ?? false;
  const periodLengthClamped = stats.periodLength.clamped;
  const variation = cycleSummary.halfRange;

  const nextPeriodStart =
    currentStatus?.expectedPeriodStart ?? null;
  const nextPeriodIn = nextPeriodStart
    ? daysBetween(parseDateKey(todayKey), parseDateKey(nextPeriodStart))
    : null;
  const nextPeriodDate = nextPeriodStart
    ? parseDateKey(nextPeriodStart).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : null;

  const phaseColors: { [phase in CyclePhase]: string } = {
    menstrual: theme.colors.primary,
    follicular: theme.colors.success,
    ovulation: OVULATION_COLOR,
    luteal: theme.colors.warning,
  };

  const chartMin =
    cyclePoints.length > 0 ? Math.min(...cyclePoints.map((point) => point.length)) : null;
  const chartMax =
    cyclePoints.length > 0 ? Math.max(...cyclePoints.map((point) => point.length)) : null;
  const chartSpan = chartMin !== null && chartMax !== null ? chartMax - chartMin : 0;
  const chartValue = (length: number) =>
    chartSpan === 0 ? 0.55 : (length - chartMin!) / chartSpan;
  const barHeight = (length: number) => 24 + chartValue(length) * 56;
  const averageBarHeight =
    cycleSummary.average !== null ? barHeight(cycleSummary.average) : null;

  const chartOverflows = cyclePoints.length > CHART_VISIBLE_CYCLES;
  const cycleChartWidth =
    measuredChartWidth > 0
      ? measuredChartWidth
      : Math.max(0, windowWidth - CYCLE_CARD_HORIZONTAL_CHROME);
  const chartColumnWidth =
    cycleChartWidth > 0
      ? (cycleChartWidth - CHART_GAP * (CHART_VISIBLE_CYCLES - 1)) / CHART_VISIBLE_CYCLES
      : 0;
  const chartContentWidth = chartOverflows
    ? cyclePoints.length * chartColumnWidth + (cyclePoints.length - 1) * CHART_GAP
    : cycleChartWidth;
  // Native Yoga collapses the columns to zero width when `flex: 0`/`width` is
  // used without an explicit basis, leaving an empty chart on Android.
  const chartColumnStyle = chartOverflows
    ? {
        width: chartColumnWidth,
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: chartColumnWidth,
      }
    : null;

  const handleChartContentSize = useCallback(() => {
    if (!chartOverflows || cycleChartWidth <= 0) return;
    const key = `${cyclePoints.length}:${Math.round(cycleChartWidth)}`;
    if (lastChartScrollKey.current === key) return;
    lastChartScrollKey.current = key;
    chartScrollRef.current?.scrollToEnd({ animated: false });
  }, [chartOverflows, cycleChartWidth, cyclePoints.length]);

  const valenceDays = stats.moodSeries.filter((point) => point.valence > 0).length;
  const chartWidth = 310;
  const cycleMeta =
    stats.totalPeriods > 0
      ? `${stats.totalPeriods} ${plural(
          stats.totalPeriods,
          'period',
          'periods'
        )} · ${Math.max(0, stats.totalPeriods - 1)} ${plural(
          Math.max(0, stats.totalPeriods - 1),
          'cycle',
          'cycles'
        )}`
      : 'No periods yet';

  return (
    <View style={styles.container}>
      <ScreenFade>
        <ScrollView testID="overview-scroll" style={styles.scrollView}>
          <ScreenHeader
            title="Overview"
            subtitle="Cycle, symptoms and mood over time"
            icon={<TrendingUp size={21} color={theme.colors.primary} />}
          />

          {/* CYCLE */}
          <SectionHeader
            title="CYCLE"
            meta={cycleMeta}
            dotColor={theme.colors.primary}
            style={styles.firstSection}
            testID="overview-cycle-meta"
          />

          <GradientCard testID="overview-cycle-hero" style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View style={styles.heroMain}>
              <Text style={styles.heroKicker}>CYCLE DAY</Text>
              <View style={styles.heroNumberRow}>
                <Text testID="overview-cycle-day" style={styles.heroNumber}>
                  {currentStatus ? currentStatus.cycleDay : '—'}
                </Text>
                {cycleLength !== null && currentStatus?.phase && (
                  <Text style={styles.heroNumberUnit}>of ~{cycleLength}</Text>
                )}
              </View>
              {currentStatus?.phase ? (
                <View style={styles.phasePill}>
                  <View
                    style={[styles.phasePillDot, { backgroundColor: phaseColors[currentStatus.phase] }]}
                  />
                  <Text style={[styles.phasePillText, { color: theme.colors.text }]}>
                    Estimated {PHASE_LABELS[currentStatus.phase].toLowerCase()} phase
                  </Text>
                </View>
              ) : (
                <Text testID="overview-phase-uncertain" style={styles.heroEmptyText}>
                  {currentStatus ? 'Phase uncertain' : 'Log your first period in Calendar'}
                </Text>
              )}
            </View>

            <View style={styles.heroSide}>
              <Text style={styles.heroSideLabel}>NEXT PERIOD</Text>
              <View style={styles.heroSideValueRow}>
                <Text testID="overview-next-period" style={nextPeriodIn !== null && nextPeriodIn <= 0 ? styles.heroEmptyText : styles.heroSideValue}>
                  {nextPeriodIn !== null ? (nextPeriodIn <= 0 ? expectedPeriodLabel(nextPeriodIn) : nextPeriodIn) : '—'}
                </Text>
                {nextPeriodIn !== null && nextPeriodIn > 0 && (
                  <Text style={styles.heroSideUnit}>days</Text>
                )}
              </View>
              {nextPeriodDate && <Text style={styles.heroSideDate}>{nextPeriodDate}</Text>}
            </View>
          </View>

          {usesStandardCycleLength && currentStatus && cycleLength !== null && (
            <Text testID="overview-cycle-basis" style={styles.heroEstimateNote}>
              Using a standard {cycleLength}-day cycle estimate until your next period.
            </Text>
          )}

          {segments.length > 0 && currentStatus && (
            <View testID="overview-phase-track" style={styles.phaseTrackWrap}>
              <View style={styles.phaseTrack}>
                {segments.map((segment, index) => (
                  <View
                    key={segment.phase}
                    style={[
                      styles.phaseTrackSegment,
                      index === 0 && styles.phaseTrackSegmentFirst,
                      index === segments.length - 1 && styles.phaseTrackSegmentLast,
                      {
                        flexGrow: segment.days,
                        flexBasis: 0,
                        backgroundColor: phaseColors[segment.phase],
                      },
                    ]}
                  />
                ))}
                <View style={[styles.phaseMarker, { left: `${markerPercent * 100}%` }]} />
              </View>
              <View style={styles.phaseTrackLabels}>
                {segments.map((segment) => (
                  <Text key={segment.phase} style={styles.phaseTrackLabel}>
                    {segment.phase === 'menstrual' ? 'Period' : PHASE_LABELS[segment.phase]}
                  </Text>
                ))}
              </View>
            </View>
          )}
          {currentStatus && !currentStatus.phase && (
            <View testID="overview-phase-track-uncertain" style={styles.phaseTrackWrap}>
              <View style={[styles.phaseTrack, styles.phaseTrackUncertain]} />
              <View style={styles.phaseTrackLabels}>
                <Text style={styles.phaseTrackLabel}>Last recorded start</Text>
                <Text style={styles.phaseTrackLabel}>Today · Day {currentStatus.cycleDay}</Text>
              </View>
              <Text style={styles.phaseTrackNote}>
                {cycleLength !== null ? `Typical cycle ~${cycleLength} days. ` : ''}
                Your cycle continues; its current phase is uncertain.
              </Text>
            </View>
          )}
        </GradientCard>

        <Card style={styles.cycleStats} padding={14}>
          <View style={styles.cycleStatsRow}>
            <View style={styles.cycleStat}>
              <View style={styles.cycleStatValueRow}>
                <Text testID="overview-avg-cycle" style={styles.cycleStatValue}>
                  {averageCycle ?? '—'}
                </Text>
                {averageCycle !== null && <Text style={styles.cycleStatUnit}>d</Text>}
              </View>
              <Text style={styles.cycleStatLabel}>Avg cycle</Text>
            </View>
            <View style={styles.cycleStatDivider} />
            <View style={styles.cycleStat}>
              <View style={styles.cycleStatValueRow}>
                <Text testID="overview-typical-period" style={styles.cycleStatValue}>
                  {typicalPeriodDays ?? '—'}
                </Text>
                {typicalPeriodDays !== null && <Text style={styles.cycleStatUnit}>d</Text>}
              </View>
              <Text style={styles.cycleStatLabel}>Typical period</Text>
            </View>
          </View>

          <View style={styles.cycleStatsRowDivider} />

          <View style={styles.cycleStatsRow}>
            <View style={styles.cycleStat}>
              <View style={styles.cycleStatValueRow}>
                <Text testID="overview-last-period" style={styles.cycleStatValue}>
                  {lastPeriodDays ?? '—'}
                </Text>
                {lastPeriodDays !== null && <Text style={styles.cycleStatUnit}>d</Text>}
              </View>
              <Text style={styles.cycleStatLabel}>Last period</Text>
              {lastPeriodActive && (
                <Text testID="overview-last-period-note" style={styles.cycleStatHint}>
                  In progress
                </Text>
              )}
            </View>
            <View style={styles.cycleStatDivider} />
            <View style={styles.cycleStat}>
              <View style={styles.cycleStatValueRow}>
                <Text testID="overview-cycle-variation" style={styles.cycleStatValue}>
                  {variation !== null ? `±${variation}` : '—'}
                </Text>
                {variation !== null && <Text style={styles.cycleStatUnit}>d</Text>}
              </View>
              <Text style={styles.cycleStatLabel}>Cycle variation</Text>
            </View>
          </View>

          <Text testID="overview-period-basis" style={styles.periodBasisNote}>
            {stats.periodLength.basis === 'recorded'
              ? `Typical period is the median of your last ${stats.periodLength.sampleSize} complete ${
                  stats.periodLength.sampleSize === 1 ? 'period' : 'periods'
                }.`
              : `Add ${
                  stats.periodLength.sampleSize > 0 ? 'one more complete period' : 'two complete periods'
                } to see your typical period. Predictions use a standard ${
                  stats.periodLength.predictionDays
                }-day estimate.`}
            {periodLengthClamped
              ? ' Recent periods were outside the usual range, so predicted spans are capped.'
              : ''}
            {lastPeriodActive ? ' Your current period is excluded until it ends.' : ''}
          </Text>
        </Card>

        <Card testID="overview-cycle-chart" style={styles.card} padding={18}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Cycle length</Text>
              {cycleSummary.regularity && (
                <Pill
                  testID="overview-cycle-regularity"
                  label={cycleSummary.regularity === 'regular' ? 'Regular' : 'Variable'}
                  tone={cycleSummary.regularity === 'regular' ? 'success' : 'warning'}
                />
              )}
            </View>
            <Text testID="overview-cycle-chart-meta" style={styles.cardMeta}>
              {cyclePoints.length > 0
                ? chartOverflows
                  ? `All ${cyclePoints.length} cycles`
                  : `Last ${cyclePoints.length} ${plural(
                      cyclePoints.length,
                      'cycle',
                      'cycles'
                    )}`
                : 'Cycle history'}
            </Text>
          </View>

          {cyclePoints.length > 0 ? (
            <>
              <View
                style={styles.cycleChart}
                onLayout={(event) => setMeasuredChartWidth(event.nativeEvent.layout.width)}
              >
                <ScrollView
                  ref={chartScrollRef}
                  horizontal
                  testID="overview-cycle-chart-scroll"
                  accessibilityLabel={`Cycle lengths for ${cyclePoints.length} ${
                    cyclePoints.length === 1 ? 'completed cycle' : 'completed cycles'
                  }`}
                  showsHorizontalScrollIndicator={false}
                  scrollEnabled={chartOverflows}
                  style={styles.cycleChartScroll}
                  contentContainerStyle={styles.cycleChartScrollContent}
                  onContentSizeChange={handleChartContentSize}
                >
                  <View
                    style={[
                      styles.cycleChartContent,
                      { width: chartOverflows ? chartContentWidth : cycleChartWidth || '100%' },
                    ]}
                  >
                    <View style={styles.cycleBars}>
                      {cyclePoints.map((point, index) => (
                        <View
                          key={point.start}
                          testID={`overview-cycle-bar-${point.start}`}
                          style={[styles.cycleBarColumn, chartColumnStyle]}
                        >
                          <Text style={[typography.caption, { color: theme.colors.textSecondary, marginBottom: 4 }]}>{point.length}</Text>
                          <View
                            style={[
                              styles.cycleBar,
                              {
                                height: barHeight(point.length),
                                backgroundColor:
                                  index === cyclePoints.length - 1
                                    ? theme.colors.primary
                                    : theme.isDark
                                      ? '#5a2437'
                                      : '#f8bbd0',
                              },
                            ]}
                          />
                        </View>
                      ))}
                    </View>
                    {averageBarHeight !== null && (
                      <View
                        style={[
                          styles.cycleAverageLine,
                          { bottom: averageBarHeight + CHART_LABEL_HEIGHT },
                        ]}
                      />
                    )}
                    <View style={styles.cycleLabels}>
                      {cyclePoints.map((point) => (
                        <Text
                          key={point.start}
                          style={[styles.cycleLabel, chartColumnStyle]}
                        >
                          {parseDateKey(point.start).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </Text>
                      ))}
                    </View>
                  </View>
                </ScrollView>
              </View>
              <Text style={styles.cycleChartCaption}>
                {cyclePoints.length === 1
                  ? `1 cycle tracked · average ${Math.round(cycleSummary.average!)} days`
                  : chartOverflows
                    ? `All ${cyclePoints.length} cycles · swipe for older · recent ${CYCLE_HISTORY_LIMIT} avg ${averageCycle} days`
                    : `Average ${averageCycle} days · range ${cycleSummary.min}–${cycleSummary.max}`}
              </Text>
            </>
          ) : (
            <EmptyState
              plain
              title="Track two periods"
              body="Your cycle length trend appears once you have two recorded starts."
            />
          )}
        </Card>

        {/* SYMPTOMS */}
        <SectionHeader
          title="SYMPTOMS"
          dotColor={theme.colors.warning}
          meta={
            stats.trackedDays > 0
              ? `${stats.trackedDays} tracked ${plural(stats.trackedDays, 'day', 'days')}`
              : 'No tracked days'
          }
        />

        <Card testID="overview-symptom-patterns-card" style={styles.card} padding={18}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Symptoms</Text>
            <Text style={styles.cardMeta}>Top 4</Text>
          </View>
          <Text style={styles.cardIntro}>
            How often each symptom shows up, split by cycle phase
          </Text>
          {stats.symptomPatterns.length > 0 ? (
            <>
              <View style={styles.symptomsList}>
                {stats.symptomPatterns.map((pattern) => {
                  const meta = symptomMeta(pattern.id);
                  return (
                    <View
                      key={pattern.id}
                      testID={`overview-symptom-row-${pattern.id}`}
                      style={styles.symptomRow}>
                      <View style={styles.symptomHeader}>
                        <View style={styles.symptomInfo}>
                          <Text style={styles.symptomEmoji}>{meta.icon}</Text>
                          <Text style={styles.symptomName}>{meta.label}</Text>
                        </View>
                        <Text
                          testID={`overview-symptom-rate-${pattern.id}`}
                          style={styles.symptomRate}>
                          {formatPercent(pattern.rate)}
                        </Text>
                      </View>
                      <View
                        testID={`overview-symptom-bar-${pattern.id}`}
                        accessible
                        accessibilityLabel={
                          `${meta.label}: ${formatPercent(pattern.rate)} of tracked days` +
                          (pattern.dominantPhase
                            ? `. Mostly ${PHASE_LABELS[pattern.dominantPhase].toLowerCase()}`
                            : '')
                        }
                        style={styles.symptomBarTrack}>
                        {pattern.phasedDays > 0 ? (
                          (['menstrual', 'follicular', 'ovulation', 'luteal'] as CyclePhase[]).map(
                            (phase) =>
                              pattern.phaseDays[phase] > 0 ? (
                                <View
                                  key={phase}
                                  testID={`overview-symptom-segment-${pattern.id}-${phase}`}
                                  style={[
                                    styles.symptomBarSegment,
                                    {
                                      width: `${
                                        (pattern.phaseDays[phase] / pattern.phasedDays) * 100
                                      }%`,
                                      backgroundColor: phaseColors[phase],
                                    },
                                  ]}
                                />
                              ) : null
                          )
                        ) : (
                          <View style={styles.symptomBarEmpty} />
                        )}
                      </View>
                      <View style={styles.symptomFooter}>
                        <Text style={styles.symptomCaption}>
                          {pattern.days} of {stats.trackedDays} tracked{' '}
                          {plural(stats.trackedDays, 'day', 'days')}
                        </Text>
                        <Text style={styles.symptomPhaseCaption}>
                          {pattern.dominantPhase
                            ? `${formatPercent(pattern.dominantShare)} in ${PHASE_LABELS[
                                pattern.dominantPhase
                              ].toLowerCase()}`
                            : 'Track periods for phase split'}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
              <View style={styles.phaseLegend}>
                {(['menstrual', 'follicular', 'ovulation', 'luteal'] as CyclePhase[]).map(
                  (phase) => (
                    <View key={phase} style={styles.phaseLegendItem}>
                      <View
                        style={[styles.phaseLegendDot, { backgroundColor: phaseColors[phase] }]}
                      />
                      <Text style={styles.phaseLegendText}>{PHASE_LABELS[phase]}</Text>
                    </View>
                  )
                )}
              </View>
              <Text style={styles.symptomFootnote}>
                Bars split each symptom's logged days across your recorded cycle phases.
              </Text>
            </>
          ) : (
            <EmptyState
              plain
              testID="overview-symptom-empty"
              title="No symptom patterns yet"
              body="Track symptoms in Calendar to see how they split across phases."
            />
          )}
        </Card>

        {/* MOOD */}
        <SectionHeader title="MOOD" meta="By phase" dotColor={OVULATION_COLOR} />

        <Card style={styles.card} padding={18}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Mood</Text>
            <Text style={styles.cardMeta}>
              {valenceDays >= 5 ? 'Trend + phases' : 'Phase averages'}
            </Text>
          </View>

          {valenceDays >= 5 && (
            <>
              <View testID="overview-mood-trend" style={styles.trendWrap}>
                <MoodTrendChart
                  series={stats.moodSeries}
                  width={chartWidth}
                  color={theme.colors.primary}
                />
              </View>
              <Text style={styles.trendCaption}>
                Last {MOOD_SERIES_DAYS} days · shaded days are period days
              </Text>
            </>
          )}

          {stats.moodPhases.length > 0 ? (
            <View style={styles.moodPhaseList}>
              {stats.moodPhases.map((entry) => (
                <View
                  key={entry.phase}
                  testID={`overview-mood-phase-${entry.phase}`}
                  style={styles.moodPhaseRow}>
                  <View style={styles.moodPhaseMain}>
                    <Text style={styles.moodPhaseName}>{PHASE_LABELS[entry.phase]}</Text>
                    <View style={styles.moodScoreWrap}>
                      {entry.averageValence !== null && (
                        <Text style={styles.moodFace}>
                          {
                            VALENCE_FACES[
                              Math.min(5, Math.max(1, Math.round(entry.averageValence)))
                            ]
                          }
                        </Text>
                      )}
                      <Text style={styles.moodScore}>
                        {entry.averageValence !== null ? entry.averageValence.toFixed(1) : '—'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.moodPhaseDetail}>
                    {entry.topTags.length > 0
                      ? entry.topTags
                          .map((tag) => `${moodLabel(tag.id)} ${levelDots(tag.averageLevel)}`)
                          .join(' · ') + ' · '
                      : ''}
                    {entry.days === 1 ? '1 day' : `${entry.days} days`}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              plain
              testID="overview-mood-empty"
              title="No mood patterns yet"
              body="Track your mood in Calendar to see your cycle patterns."
            />
          )}

          {valenceDays > 0 && valenceDays < 5 && (
            <Text style={styles.moodPartialNote}>
              Log a few more moods to unlock the {MOOD_SERIES_DAYS}-day trend.
            </Text>
          )}
        </Card>

        <View style={styles.footnote}>
          <Text style={[typography.caption, styles.footnoteText, { color: theme.colors.textSecondary }]}>
            Everything here comes from your Calendar entries. Tap any day there to edit it.
          </Text>
        </View>
        </ScrollView>
      </ScreenFade>
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollView: {
      flex: 1,
    },
    firstSection: {
      marginTop: 10,
    },
    heroCard: {
      marginHorizontal: 20,
      marginTop: 2,
    },
    heroRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    heroMain: {
      flex: 1,
    },
    heroKicker: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      color: theme.colors.textSecondary,
    },
    heroNumberRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 5,
      marginTop: 4,
    },
    heroNumber: {
      fontSize: 44,
      fontWeight: '800',
      lineHeight: 48,
      color: theme.colors.text,
    },
    heroNumberUnit: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    phasePill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: theme.isDark ? '#2a1a20' : theme.colors.white,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
      marginTop: 9,
      borderWidth: 1,
      borderColor: theme.isDark ? '#4a2836' : '#fbe4ec',
    },
    phasePillDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    phasePillText: {
      fontSize: 11,
      fontWeight: '700',
    },
    heroEmptyText: {
      fontSize: 12,
      lineHeight: 17,
      color: theme.colors.textSecondary,
      marginTop: 12,
      maxWidth: 190,
    },
    heroSide: {
      alignItems: 'flex-end',
      paddingTop: 2,
    },
    heroSideLabel: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.9,
      color: theme.colors.textSecondary,
    },
    heroSideValueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 3,
      marginTop: 3,
    },
    heroSideValue: {
      fontSize: 28,
      fontWeight: '800',
      color: theme.colors.text,
      lineHeight: 30,
    },
    heroSideUnit: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    heroSideDate: {
      fontSize: 11,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    heroEstimateNote: {
      fontSize: 11,
      lineHeight: 16,
      color: theme.colors.textSecondary,
      marginTop: 10,
    },
    phaseTrackWrap: {
      marginTop: 14,
    },
    phaseTrack: {
      flexDirection: 'row',
      height: 8,
      gap: 2,
      position: 'relative',
      overflow: 'visible',
    },
    phaseTrackSegment: {
      height: 8,
    },
    phaseTrackUncertain: {
      backgroundColor: theme.colors.border,
      borderRadius: radii.pill,
    },
    phaseTrackNote: {
      ...typography.caption,
      color: theme.colors.textSecondary,
      marginTop: spacing.sm,
    },
    phaseTrackSegmentFirst: {
      borderTopLeftRadius: 999,
      borderBottomLeftRadius: 999,
    },
    phaseTrackSegmentLast: {
      borderTopRightRadius: 999,
      borderBottomRightRadius: 999,
    },
    phaseMarker: {
      position: 'absolute',
      top: -4,
      width: 2,
      height: 16,
      marginLeft: -1,
      borderRadius: 1,
      backgroundColor: theme.colors.text,
      borderWidth: 1,
      borderColor: theme.colors.surface,
    },
    phaseTrackLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 7,
    },
    phaseTrackLabel: {
      fontSize: 9,
      color: theme.colors.textSecondary,
    },
    cycleStats: {
      alignItems: 'stretch',
      marginHorizontal: 20,
      marginTop: 10,
      paddingVertical: 14,
      paddingHorizontal: 4,
    },
    cycleStatsRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    cycleStatsRowDivider: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginVertical: 12,
      marginHorizontal: 8,
    },
    cycleStat: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 3,
    },
    cycleStatValueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 1,
    },
    cycleStatValue: {
      fontSize: 26,
      fontWeight: '800',
      lineHeight: 30,
      color: theme.colors.text,
    },
    cycleStatUnit: {
      fontSize: 10,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    cycleStatLabel: {
      fontSize: 11,
      color: theme.colors.textSecondary,
      marginTop: 3,
    },
    cycleStatDivider: {
      width: 1,
      backgroundColor: theme.colors.border,
      marginVertical: 2,
    },
    cycleStatHint: {
      fontSize: 9,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    periodBasisNote: {
      fontSize: 10,
      lineHeight: 15,
      color: theme.colors.textSecondary,
      marginTop: 12,
      textAlign: 'center',
    },
    card: {
      marginHorizontal: 20,
      marginTop: 10,
    },
    cardHeader: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    cardTitleRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 7,
    },
    cardTitle: {
      ...typography.cardTitle,
      color: theme.colors.text,
    },
    cardMeta: {
      ...typography.sectionMeta,
      color: theme.colors.textSecondary,
    },
    cardIntro: {
      ...typography.body,
      color: theme.colors.textSecondary,
      marginTop: 3,
      marginBottom: 14,
    },
    regularityPill: {
      backgroundColor: theme.isDark ? '#1f3a24' : '#e8f5e9',
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    regularityPillVariable: {
      backgroundColor: theme.isDark ? '#3a2a14' : '#fff3e0',
    },
    regularityText: {
      fontSize: 10,
      fontWeight: '800',
      color: theme.success,
    },
    regularityTextVariable: {
      color: theme.colors.warning,
    },
    cycleChart: {
      marginTop: 6,
    },
    cycleChartScroll: {
      height: CHART_TOTAL_HEIGHT,
    },
    cycleChartScrollContent: {
      flexGrow: 1,
    },
    cycleChartContent: {
      height: CHART_TOTAL_HEIGHT,
      position: 'relative',
      flexShrink: 0,
    },
    cycleBars: {
      height: CHART_HEIGHT + 24,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: CHART_GAP,
    },
    cycleBarColumn: {
      flexGrow: 1,
      flexShrink: 1,
      height: '100%',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    cycleBar: {
      width: '100%',
      maxWidth: 34,
      borderTopLeftRadius: 5,
      borderTopRightRadius: 5,
      borderBottomLeftRadius: 2,
      borderBottomRightRadius: 2,
    },
    cycleAverageLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      borderTopWidth: 1,
      borderStyle: 'dashed',
      borderTopColor: theme.colors.textSecondary,
      opacity: 0.4,
    },
    cycleLabels: {
      flexDirection: 'row',
      gap: CHART_GAP,
      marginTop: 6,
    },
    cycleLabel: {
      flexGrow: 1,
      flexShrink: 1,
      textAlign: 'center',
      fontSize: 9,
      color: theme.colors.textSecondary,
    },
    cycleChartCaption: {
      fontSize: 11,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginTop: 2,
    },
    symptomsList: {
      gap: 16,
    },
    symptomRow: {
      gap: 5,
    },
    symptomHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    symptomInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    symptomEmoji: {
      fontSize: 18,
      marginRight: 8,
    },
    symptomName: {
      ...typography.rowTitle,
      color: theme.colors.text,
      flex: 1,
    },
    symptomRate: {
      fontSize: 13,
      fontWeight: '800',
      color: theme.colors.text,
      marginLeft: 8,
    },
    symptomBarTrack: {
      height: 9,
      borderRadius: 5,
      overflow: 'hidden',
      flexDirection: 'row',
      backgroundColor: theme.colors.border,
    },
    symptomBarSegment: {
      height: '100%',
    },
    symptomBarEmpty: {
      flex: 1,
      backgroundColor: theme.colors.border,
    },
    symptomFooter: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    symptomCaption: {
      ...typography.caption,
      color: theme.colors.textSecondary,
    },
    symptomPhaseCaption: {
      ...typography.caption,
      color: theme.colors.textSecondary,
      textAlign: 'right',
    },
    phaseLegend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 16,
      paddingTop: 11,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    phaseLegendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    phaseLegendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    phaseLegendText: {
      fontSize: 10,
      color: theme.colors.textSecondary,
    },
    symptomFootnote: {
      fontSize: 11,
      lineHeight: 16,
      color: theme.colors.textSecondary,
      fontStyle: 'italic',
      marginTop: 9,
    },
    trendWrap: {
      alignItems: 'stretch',
      marginTop: 4,
    },
    trendCaption: {
      fontSize: 11,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginTop: 6,
      marginBottom: 14,
    },
    moodPhaseList: {
      gap: 12,
    },
    moodPhaseRow: {
      gap: 2,
    },
    moodPhaseMain: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    moodPhaseName: {
      ...typography.rowTitle,
      color: theme.colors.text,
    },
    moodScoreWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    moodFace: {
      fontSize: 15,
    },
    moodScore: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      minWidth: 28,
      textAlign: 'right',
    },
    moodPhaseDetail: {
      ...typography.caption,
      color: theme.colors.textSecondary,
    },
    moodPartialNote: {
      fontSize: 11,
      lineHeight: 15,
      color: theme.colors.textSecondary,
      fontStyle: 'italic',
      marginTop: 10,
    },
    emptyText: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      fontStyle: 'italic',
      paddingVertical: 16,
    },
    footnote: {
      marginHorizontal: 24,
      marginTop: 14,
      marginBottom: 24,
    },
    footnoteText: {
      lineHeight: 16,
    },
  });
