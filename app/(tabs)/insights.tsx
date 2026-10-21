import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';
import { ChartBar as BarChart2, TrendingUp, Calendar, Heart } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DataService } from '@/services/DataService';
import { FertilityForecast } from '@/services/FertilityService';
import { MoodSeriesPoint, PhaseMoodSummary, MOOD_SERIES_DAYS } from '@/services/MoodInsights';
import { MOOD_OPTIONS } from '@/services/MoodTags';
import {
  CYCLE_PHASE_TIPS,
  getCurrentPhaseStatus,
  CyclePhase,
  PHASE_ORDER,
} from '@/services/CyclePhaseTips';
import { SymptomPattern } from '@/services/SymptomInsights';
import { symptomMeta } from '@/services/Symptoms';
import { daysBetween, formatDateKey, parseDateKey } from '@/services/dateKey';
import { useTheme } from '@/hooks/useTheme';

// Intentional accent for ovulation marks; keeps them distinct from period pink.
const OVULATION_COLOR = '#009688';

const { width: screenWidth } = Dimensions.get('window');

const VALENCE_FACES: { [value: number]: string } = {
  1: '😞',
  2: '😕',
  3: '😐',
  4: '🙂',
  5: '😄',
};

const PHASE_LABELS: { [phase: string]: string } = {
  menstrual: 'Menstrual',
  follicular: 'Follicular',
  ovulation: 'Ovulation',
  luteal: 'Luteal',
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
    .filter((point) => point.valence > 0);

  return (
    <Svg width={width} height={height}>
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
        <Polyline
          points={logged.map((point) => `${x(point.index)},${y(point.valence)}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {logged.map((point) => (
        <Circle key={point.date} cx={x(point.index)} cy={y(point.valence)} r={3} fill={color} />
      ))}
    </Svg>
  );
}

export default function InsightsTab() {
  const { theme } = useTheme();
  const [stats, setStats] = useState({
    averageCycle: 28,
    lastPeriodLength: 0,
    nextPeriodIn: 0,
    totalPeriods: 0,
    moodSeries: [] as MoodSeriesPoint[],
    moodPhases: [] as PhaseMoodSummary[],
    periodStarts: [] as string[],
    symptomPatterns: [] as SymptomPattern[],
    trackedDays: 0,
  });
  const [fertility, setFertility] = useState<FertilityForecast | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<CyclePhase | null>(null);

  const loadInsights = useCallback(async () => {
    const [data, ovulation] = await Promise.all([
      DataService.getInsights(),
      DataService.getFertilityForecast(),
    ]);
    setStats(data);
    setFertility(ovulation);
    setSelectedPhase(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadInsights();
    }, [loadInsights])
  );

  const formatShortDate = (dateKey: string) => {
    return parseDateKey(dateKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const daysUntilLabel = (dateKey: string) => {
    const days = daysBetween(parseDateKey(formatDateKey(new Date())), parseDateKey(dateKey));
    if (days <= 0) return 'today';
    return days === 1 ? 'in 1 day' : `in ${days} days`;
  };

  const styles = createStyles(theme);

  const currentCycleOvulation = fertility?.currentCycleOvulation ?? null;
  const nextCycleForecast = fertility?.cycles[0] ?? null;
  const valenceDays = stats.moodSeries.filter((point) => point.valence > 0).length;
  const chartWidth = screenWidth - 80;

  const todayKey = formatDateKey(new Date());
  const currentStatus = getCurrentPhaseStatus(todayKey, stats.periodStarts);
  const activePhase = selectedPhase ?? currentStatus?.phase ?? 'menstrual';
  const phaseInfo = CYCLE_PHASE_TIPS[activePhase];

  const phaseColors: { [phase in CyclePhase]: string } = {
    menstrual: theme.colors.primary,
    follicular: theme.colors.success,
    ovulation: OVULATION_COLOR,
    luteal: theme.colors.warning,
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Insights</Text>
          <BarChart2 size={24} color={theme.colors.primary} />
        </View>

        {/* Cycle Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Calendar size={32} color={theme.colors.primary} />
            <Text testID="insights-avg-cycle" style={styles.statNumber}>{stats.averageCycle}</Text>
            <Text style={styles.statLabel}>Avg Cycle Length</Text>
            <Text style={styles.statUnit}>days</Text>
          </View>

          <View style={styles.statCard}>
            <Heart size={32} color={theme.colors.error} />
            <Text testID="insights-last-period" style={styles.statNumber}>{stats.lastPeriodLength}</Text>
            <Text style={styles.statLabel}>Last Period</Text>
            <Text style={styles.statUnit}>days</Text>
          </View>

          <View style={styles.statCard}>
            <TrendingUp size={32} color={theme.colors.success} />
            <Text testID="insights-next-period" style={styles.statNumber}>{stats.nextPeriodIn}</Text>
            <Text style={styles.statLabel}>Next Period</Text>
            <Text style={styles.statUnit}>days</Text>
          </View>

          <View style={styles.statCard}>
            <BarChart2 size={32} color={theme.colors.warning} />
            <Text testID="insights-total-periods" style={styles.statNumber}>{stats.totalPeriods}</Text>
            <Text style={styles.statLabel}>Total Tracked</Text>
            <Text style={styles.statUnit}>periods</Text>
          </View>
        </View>

        {/* Fertility */}
        <View testID="insights-fertility-card" style={styles.card}>
          <Text style={styles.cardTitle}>Fertility</Text>
          {currentCycleOvulation || nextCycleForecast ? (
            <View style={styles.fertilityRows}>
              {currentCycleOvulation && (
                <View style={styles.fertilityRow}>
                  <Text style={styles.fertilityLabel}>Recorded ovulation</Text>
                  <Text testID="insights-recorded-ovulation" style={styles.fertilityValue}>
                    {formatShortDate(currentCycleOvulation)}
                  </Text>
                </View>
              )}
              {nextCycleForecast && (
                <>
                  <View style={styles.fertilityRow}>
                    <Text style={styles.fertilityLabel}>Next ovulation</Text>
                    <Text testID="insights-next-ovulation" style={styles.fertilityValue}>
                      {formatShortDate(nextCycleForecast.ovulationDate)} ({daysUntilLabel(nextCycleForecast.ovulationDate)})
                    </Text>
                  </View>
                  <View style={styles.fertilityRow}>
                    <Text style={styles.fertilityLabel}>Fertile window</Text>
                    <Text testID="insights-fertile-window" style={styles.fertilityValue}>
                      {formatShortDate(nextCycleForecast.windowStart)} – {formatShortDate(nextCycleForecast.windowEnd)}
                    </Text>
                  </View>
                </>
              )}
              <Text style={styles.fertilityNote}>
                {fertility?.stats.basis === 'recorded' ? 'Personalized from your recorded cycles' : 'Estimated from a standard cycle'}
              </Text>
            </View>
          ) : (
            <Text style={styles.noDataText}>Track your period to see fertility forecasts!</Text>
          )}
          <Text style={styles.fertilityDisclaimer}>Wellness estimate — not a contraceptive method.</Text>
        </View>

        {/* Symptom Patterns */}
        <View testID="insights-symptom-patterns-card" style={styles.card}>
          <Text style={styles.cardTitle}>Symptom Patterns</Text>
          <Text style={styles.symptomIntro}>Where your symptoms show up across your cycle</Text>
          {stats.symptomPatterns.length > 0 ? (
            <>
              <View style={styles.symptomsList}>
                {stats.symptomPatterns.map((pattern) => {
                  const meta = symptomMeta(pattern.id);
                  const phaseBreakdown = PHASE_ORDER
                    .filter((phase) => pattern.phaseDays[phase] > 0)
                    .map(
                      (phase) =>
                        `${PHASE_LABELS[phase]} ${formatPercent(
                          pattern.phaseDays[phase] / Math.max(1, pattern.phasedDays)
                        )}`
                    )
                    .join(', ');

                  return (
                    <View
                      key={pattern.id}
                      testID={`insights-symptom-row-${pattern.id}`}
                      style={styles.symptomRow}>
                      <View style={styles.symptomHeader}>
                        <View style={styles.symptomInfo}>
                          <Text style={styles.symptomEmoji}>{meta.icon}</Text>
                          <Text style={styles.symptomName}>{meta.label}</Text>
                        </View>
                        <Text
                          testID={`insights-symptom-rate-${pattern.id}`}
                          style={styles.symptomRate}>
                          {formatPercent(pattern.rate)}
                        </Text>
                      </View>
                      <View
                        testID={`insights-symptom-bar-${pattern.id}`}
                        accessible
                        accessibilityLabel={
                          `${meta.label}: ${formatPercent(pattern.rate)} of tracked days` +
                          (phaseBreakdown ? `. ${phaseBreakdown}` : '')
                        }
                        style={styles.symptomBarTrack}>
                        {pattern.phasedDays > 0 ? (
                          PHASE_ORDER.map((phase) =>
                            pattern.phaseDays[phase] > 0 ? (
                              <View
                                key={phase}
                                testID={`insights-symptom-segment-${pattern.id}-${phase}`}
                                style={[
                                  styles.symptomBarSegment,
                                  {
                                    width: `${(pattern.phaseDays[phase] / pattern.phasedDays) * 100}%`,
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
                          {stats.trackedDays === 1 ? 'day' : 'days'}
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
                {PHASE_ORDER.map((phase) => (
                  <View key={phase} style={styles.phaseLegendItem}>
                    <View
                      style={[styles.phaseLegendDot, { backgroundColor: phaseColors[phase] }]}
                    />
                    <Text style={styles.phaseLegendText}>{PHASE_LABELS[phase]}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.symptomFootnote}>
                Bars split each symptom's logged days across your recorded cycle phases.
              </Text>
            </>
          ) : (
            <Text style={styles.noDataText}>Track symptoms to see your patterns!</Text>
          )}
        </View>

        {/* Mood & Cycle */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mood & Cycle</Text>
          {valenceDays >= 5 && (
            <>
              <View testID="insights-mood-trend" style={styles.trendWrap}>
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
            <View style={styles.phaseList}>
              {stats.moodPhases.map((entry) => (
                <View
                  key={entry.phase}
                  testID={`insights-mood-phase-${entry.phase}`}
                  style={styles.phaseRow}>
                  <View style={styles.phaseMain}>
                    <Text style={styles.phaseName}>{PHASE_LABELS[entry.phase]}</Text>
                    <View style={styles.phaseScoreWrap}>
                      {entry.averageValence !== null && (
                        <Text style={styles.phaseFace}>
                          {VALENCE_FACES[Math.min(5, Math.max(1, Math.round(entry.averageValence)))]}
                        </Text>
                      )}
                      <Text style={styles.phaseScore}>
                        {entry.averageValence !== null ? entry.averageValence.toFixed(1) : '—'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.phaseDetail}>
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
            <Text testID="insights-mood-empty" style={styles.noDataText}>
              Track your moods to see your cycle patterns!
            </Text>
          )}
        </View>

        {/* Cycle Phase Tips */}
        <View testID="insights-phase-tips-card" style={styles.card}>
          <View style={styles.phaseTipsHeader}>
            <View style={styles.phaseTipsTitleRow}>
              <Text style={[styles.cardTitle, styles.phaseTipsTitle]}>Cycle Phase Tips</Text>
              {currentStatus && (
                <View testID="insights-current-phase-badge" style={styles.currentBadge}>
                  <Text style={styles.currentBadgeDot}>●</Text>
                  <Text style={styles.currentBadgeText}>Today · Day {currentStatus.cycleDay}</Text>
                </View>
              )}
            </View>
            <Text style={styles.phaseTipsSubtitle}>Guidance synced to your body's rhythm</Text>
            {!currentStatus && (
              <Text testID="insights-phase-no-data" style={styles.phaseTipsHint}>
                Track your period to see which phase you're in. You can still browse all phases.
              </Text>
            )}
          </View>

          {/* Phase Selector Tabs */}
          <View style={styles.phaseTabsRow}>
            {PHASE_ORDER.map((phase) => {
              const isSelected = activePhase === phase;
              const isCurrent = currentStatus?.phase === phase;
              return (
                <TouchableOpacity
                  key={phase}
                  testID={`insights-phase-tab-${phase}`}
                  style={[styles.phaseTab, isSelected && styles.phaseTabSelected]}
                  onPress={() => setSelectedPhase(phase)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}>
                  <Text
                    style={[
                      styles.phaseTabText,
                      isSelected && styles.phaseTabTextSelected,
                    ]}>
                    {PHASE_LABELS[phase]}
                  </Text>
                  {isCurrent && (
                    <View
                      style={[
                        styles.currentPhaseDot,
                        isSelected && styles.currentPhaseDotSelected,
                      ]}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Active Phase Overview */}
          <View style={styles.phaseSummaryCard}>
            <View style={styles.phaseSummaryTop}>
              <Text testID="insights-phase-summary-title" style={styles.phaseSummaryTitle}>{phaseInfo.title}</Text>
              <Text style={styles.phaseSummaryDayRange}>{phaseInfo.dayRange}</Text>
            </View>
            <Text style={styles.phaseSummaryTagline}>{phaseInfo.tagline}</Text>
            <Text style={styles.phaseSummaryDesc}>{phaseInfo.summary}</Text>
            <View style={styles.hormoneBadge}>
              <Text style={styles.hormoneBadgeLabel}>HORMONES:</Text>
              <Text style={styles.hormoneBadgeText}>{phaseInfo.hormones}</Text>
            </View>
          </View>

          {/* Categorized Tips List */}
          <View style={styles.phaseTipsList}>
            {phaseInfo.tips.map((tip) => (
              <View
                key={tip.category}
                testID={`insights-phase-tip-${tip.category}`}
                style={styles.phaseTipItem}>
                <Text style={styles.phaseTipEmoji}>{tip.iconEmoji}</Text>
                <View style={styles.phaseTipContent}>
                  <View style={styles.phaseTipCategoryRow}>
                    <Text style={styles.phaseTipCategory}>{tip.categoryLabel}</Text>
                  </View>
                  <Text style={styles.phaseTipTitle}>{tip.title}</Text>
                  <Text style={styles.phaseTipDesc}>{tip.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  statCard: {
    width: '48%',
    backgroundColor: theme.colors.surface,
    marginBottom: 15,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 2,
    shadowColor: theme.colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 10,
  },
  statLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 5,
  },
  statUnit: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: 20,
    marginVertical: 10,
    padding: 20,
    borderRadius: 12,
    elevation: 2,
    shadowColor: theme.colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 15,
  },
  noDataText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 20,
  },
  symptomIntro: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: -8,
    marginBottom: 16,
  },
  symptomsList: {
    gap: 18,
  },
  symptomRow: {
    gap: 6,
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
    fontSize: 20,
    marginRight: 10,
  },
  symptomName: {
    fontSize: 16,
    color: theme.colors.text,
    flex: 1,
  },
  symptomRate: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    marginLeft: 8,
  },
  symptomBarTrack: {
    height: 10,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  symptomCaption: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  symptomPhaseCaption: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    textAlign: 'right',
  },
  phaseLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 18,
    paddingTop: 12,
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
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  symptomFootnote: {
    fontSize: 11,
    lineHeight: 15,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 10,
  },
  trendWrap: {
    alignItems: 'center',
  },
  trendCaption: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  phaseList: {
    gap: 14,
  },
  phaseRow: {
    gap: 3,
  },
  phaseMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  phaseName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  phaseScoreWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  phaseFace: {
    fontSize: 16,
  },
  phaseScore: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    minWidth: 28,
    textAlign: 'right',
  },
  phaseDetail: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  phaseTipsHeader: {
    marginBottom: 16,
  },
  phaseTipsTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  phaseTipsTitle: {
    flexShrink: 1,
    marginBottom: 0,
  },
  phaseTipsSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  phaseTipsHint: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: theme.colors.secondary,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  currentBadgeDot: {
    fontSize: 8,
    color: theme.colors.primary,
    marginRight: 4,
  },
  currentBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  phaseTabsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  phaseTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.secondary,
  },
  phaseTabSelected: {
    backgroundColor: theme.colors.primary,
  },
  phaseTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  phaseTabTextSelected: {
    color: theme.colors.white,
  },
  currentPhaseDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
    marginTop: 3,
  },
  currentPhaseDotSelected: {
    backgroundColor: theme.colors.white,
  },
  phaseSummaryCard: {
    backgroundColor: theme.colors.secondary,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  phaseSummaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  phaseSummaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  phaseSummaryDayRange: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  phaseSummaryTagline: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 6,
  },
  phaseSummaryDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.text,
    marginBottom: 10,
  },
  hormoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  hormoneBadgeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
  },
  hormoneBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  phaseTipsList: {
    gap: 12,
  },
  phaseTipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 10,
    backgroundColor: theme.colors.secondary,
    gap: 12,
  },
  phaseTipEmoji: {
    fontSize: 22,
    marginTop: 2,
  },
  phaseTipContent: {
    flex: 1,
  },
  phaseTipCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  phaseTipCategory: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.primary,
    letterSpacing: 0.5,
  },
  phaseTipTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  phaseTipDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.textSecondary,
  },
  fertilityRows: {
    gap: 12,
  },
  fertilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fertilityLabel: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  fertilityValue: {
    fontSize: 16,
    fontWeight: '500',
    color: OVULATION_COLOR,
  },
  fertilityNote: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  fertilityDisclaimer: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 10,
    fontStyle: 'italic',
  },
});