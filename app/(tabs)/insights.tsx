import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';
import { ChartBar as BarChart2, TrendingUp, Calendar, Heart } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DataService } from '@/services/DataService';
import { FertilityForecast } from '@/services/FertilityService';
import { MoodSeriesPoint, PhaseMoodSummary, MOOD_SERIES_DAYS } from '@/services/MoodInsights';
import { MOOD_OPTIONS } from '@/services/MoodTags';
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
    commonSymptoms: [] as Array<{symptom: string, count: number}>,
    moodSeries: [] as MoodSeriesPoint[],
    moodPhases: [] as PhaseMoodSummary[],
  });
  const [fertility, setFertility] = useState<FertilityForecast | null>(null);

  const loadInsights = useCallback(async () => {
    const [data, ovulation] = await Promise.all([
      DataService.getInsights(),
      DataService.getFertilityForecast(),
    ]);
    setStats(data);
    setFertility(ovulation);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadInsights();
    }, [loadInsights])
  );

  const getSymptomEmoji = (symptom: string) => {
    const emojiMap: { [key: string]: string } = {
      cramps: '😣',
      headache: '🤕',
      bloating: '😵',
      breastache: '🤱',
      mood: '😢',
      fatigue: '😴',
      backache: '😖',
    };
    return emojiMap[symptom] || '💊';
  };

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

        {/* Common Symptoms */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Most Common Symptoms</Text>
          {stats.commonSymptoms.length > 0 ? (
            <View style={styles.symptomsList}>
              {stats.commonSymptoms.map((item, index) => (
                <View key={index} style={styles.symptomItem}>
                  <View style={styles.symptomInfo}>
                    <Text style={styles.symptomEmoji}>
                      {getSymptomEmoji(item.symptom)}
                    </Text>
                    <Text style={styles.symptomName}>
                      {item.symptom.charAt(0).toUpperCase() + item.symptom.slice(1)}
                    </Text>
                  </View>
                  <View style={styles.symptomBar}>
                    <View 
                      style={[
                        styles.symptomBarFill, 
                        { width: `${(item.count / Math.max(...stats.commonSymptoms.map(s => s.count))) * 100}%` }
                      ]} 
                    />
                    <Text style={styles.symptomCount}>{item.count}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.noDataText}>Start tracking to see your patterns!</Text>
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

        {/* Health Tips */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Health Tips</Text>
          <View style={styles.tipsList}>
            <View style={styles.tip}>
              <Text style={styles.tipEmoji}>💧</Text>
              <Text style={styles.tipText}>Stay hydrated during your period</Text>
            </View>
            <View style={styles.tip}>
              <Text style={styles.tipEmoji}>🏃‍♀️</Text>
              <Text style={styles.tipText}>Light exercise can help with cramps</Text>
            </View>
            <View style={styles.tip}>
              <Text style={styles.tipEmoji}>🍫</Text>
              <Text style={styles.tipText}>Dark chocolate may reduce PMS symptoms</Text>
            </View>
            <View style={styles.tip}>
              <Text style={styles.tipEmoji}>😴</Text>
              <Text style={styles.tipText}>Get enough sleep for hormonal balance</Text>
            </View>
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
  symptomsList: {
    gap: 15,
  },
  symptomItem: {
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
  symptomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 10,
  },
  symptomBarFill: {
    height: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 4,
    minWidth: 20,
  },
  symptomCount: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 8,
    minWidth: 20,
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
  tipsList: {
    gap: 15,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tipEmoji: {
    fontSize: 20,
    marginRight: 15,
  },
  tipText: {
    fontSize: 16,
    color: theme.colors.text,
    flex: 1,
    lineHeight: 22,
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