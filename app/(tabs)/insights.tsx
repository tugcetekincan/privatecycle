import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Lightbulb } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { DataService } from '@/services/DataService';
import type { DailyData } from '@/services/DataService';
import { CyclePhase, expectedPeriodLabel, PHASE_LABELS } from '@/services/CycleModel';
import {
  CYCLE_PHASE_TIPS,
  getCurrentPhaseStatus,
  PHASE_ORDER,
  TODAY_FOCUS,
  UNCERTAIN_PHASE_FOCUS,
} from '@/services/CyclePhaseTips';
import { buildNarrative, NarrativePattern } from '@/services/CycleNarrative';
import { buildTodayTips } from '@/services/TodayTips';
import { formatDateKey } from '@/services/dateKey';
import { useTheme } from '@/hooks/useTheme';
import ScreenHeader from '@/components/ui/ScreenHeader';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, GradientCard } from '@/components/ui/Card';
import Pill from '@/components/ui/Pill';
import EmptyState from '@/components/ui/EmptyState';
import ScreenFade from '@/components/ui/ScreenFade';
import { radii, spacing, typography } from '@/design/tokens';

// Intentional accent for ovulation; keeps it distinct from period pink.
const OVULATION_COLOR = '#009688';

const PHASE_BADGE_LABELS: Record<CyclePhase, string> = {
  menstrual: 'MENSTRUAL',
  follicular: 'FOLLICULAR',
  ovulation: 'OVULATION',
  luteal: 'LUTEAL',
};

type InsightStats = Awaited<ReturnType<typeof DataService.getInsights>>;

const sentenceCase = (value: string): string =>
  value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

const EMPTY_STATS: InsightStats = {
  averageCycle: 28,
  lastPeriodLength: 0,
  nextPeriodIn: 0,
  totalPeriods: 0,
  moodSeries: [],
  moodPhases: [],
  periodStarts: [],
  ovulationDays: [],
  symptomPatterns: [],
  trackedDays: 0,
};

export default function InsightsTab() {
  const { theme } = useTheme();
  const [stats, setStats] = useState<InsightStats>(EMPTY_STATS);
  const [todayLog, setTodayLog] = useState<DailyData | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<CyclePhase | null>(null);

  const loadInsights = useCallback(async () => {
    const [data, today] = await Promise.all([
      DataService.getInsights(),
      DataService.getTodayData(formatDateKey(new Date())),
    ]);
    setStats(data);
    setTodayLog(today);
    setSelectedPhase(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadInsights();
    }, [loadInsights])
  );

  const styles = createStyles(theme);
  const todayKey = formatDateKey(new Date());
  const currentStatus = getCurrentPhaseStatus(
    todayKey,
    stats.periodStarts,
    stats.ovulationDays
  );
  const narrative = buildNarrative({
    symptomPatterns: stats.symptomPatterns,
    moodPhases: stats.moodPhases,
    periodStarts: stats.periodStarts,
  });
  const todayTips = buildTodayTips(todayLog);

  const activePhase: CyclePhase = selectedPhase ?? currentStatus?.phase ?? 'menstrual';
  const phaseInfo = CYCLE_PHASE_TIPS[activePhase];
  const currentPhaseInfo = currentStatus?.phase ? CYCLE_PHASE_TIPS[currentStatus.phase] : null;
  const todayFocus = currentStatus?.phase ? TODAY_FOCUS[currentStatus.phase] : UNCERTAIN_PHASE_FOCUS;
  const showPhaseSummary = !currentStatus || activePhase !== currentStatus.phase;

  const phaseColors: { [phase in CyclePhase]: string } = {
    menstrual: theme.colors.primary,
    follicular: theme.colors.success,
    ovulation: OVULATION_COLOR,
    luteal: theme.colors.warning,
  };

  const renderPatternVisual = (pattern: NarrativePattern) => {
    if (pattern.visual.type === 'phase') {
      return (
        <View>
          <View style={styles.miniPhaseBar}>
            {pattern.visual.shares
              .filter((entry) => entry.share > 0)
              .map((entry) => (
                <View
                  key={entry.phase}
                  style={{
                    flexGrow: entry.share,
                    flexBasis: 0,
                    backgroundColor: phaseColors[entry.phase],
                  }}
                />
              ))}
            {pattern.visual.unphasedShare > 0.01 && (
              <View
                style={{
                  flexGrow: pattern.visual.unphasedShare,
                  flexBasis: 0,
                  backgroundColor: theme.colors.border,
                }}
              />
            )}
          </View>
          <View style={styles.miniPhaseLegend}>
            {PHASE_ORDER.map((phase) => (
              <Text key={phase} style={styles.miniPhaseLegendText}>
                {PHASE_LABELS[phase]}
              </Text>
            ))}
          </View>
        </View>
      );
    }

    if (pattern.visual.type === 'mood') {
      return (
        <View style={styles.compareBars}>
          {pattern.visual.rows.map((row) => (
            <View key={row.phase} style={styles.compareRow}>
              <Text style={styles.compareLabel}>{row.label}</Text>
              <View style={styles.compareTrack}>
                <View
                  style={[
                    styles.compareFill,
                    {
                      width: `${(row.value / 5) * 100}%`,
                      backgroundColor: phaseColors[row.phase],
                    },
                  ]}
                />
              </View>
              <Text style={styles.compareValue}>{row.value.toFixed(1)}</Text>
            </View>
          ))}
        </View>
      );
    }

    const range = pattern.visual;
    const span = range.max - range.min;
    const averagePosition = span === 0 ? 50 : ((range.average - range.min) / span) * 100;

    return (
      <View style={styles.rangeStrip}>
        <View style={styles.rangeTrack}>
          <View style={styles.rangeFill} />
          <View
            style={[
              styles.rangeDot,
              { left: `${Math.min(100, Math.max(0, averagePosition))}%` },
            ]}
          />
        </View>
        <View style={styles.rangeLabels}>
          <Text style={styles.rangeLabel}>{range.min}d</Text>
          <Text style={styles.rangeLabel}>{range.max}d</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenFade>
        <ScrollView testID="insights-scroll" style={styles.scrollView}>
          <ScreenHeader
            title="Insights"
            subtitle="What your log is telling you"
            icon={<Lightbulb size={21} color={theme.colors.primary} />}
          />

          {/* Today */}
          {currentStatus ? (
            <GradientCard testID="insights-today-card" style={styles.todayCard}>
            <View style={styles.todayTop}>
              <Text style={styles.todayKicker}>TODAY</Text>
              <View testID="insights-current-phase-badge" style={styles.todayPill}>
                <Text style={styles.todayPillText}>
                  {currentStatus.phase ? PHASE_BADGE_LABELS[currentStatus.phase] : 'PHASE UNCERTAIN'} · DAY {currentStatus.cycleDay}
                </Text>
              </View>
            </View>
            <Text style={styles.todayTitle}>
              {currentPhaseInfo ? sentenceCase(currentPhaseInfo.tagline) : expectedPeriodLabel(currentStatus.daysUntilExpected)}
            </Text>
            <Text style={styles.todaySummary}>
              {currentPhaseInfo ? currentPhaseInfo.summary : 'An estimate is not a recorded period. Your cycle continues from your last logged start. Log a new period in Calendar when it begins.'}
            </Text>

            <View testID="insights-today-focus" style={styles.focusRow}>
              <Text style={styles.focusEmoji}>{todayFocus.emoji}</Text>
              <View style={styles.focusCopy}>
                <Text style={styles.focusLabel}>TODAY'S FOCUS</Text>
                <Text style={styles.focusTitle}>{todayFocus.title}</Text>
                <Text style={styles.focusDesc}>{todayFocus.description}</Text>
              </View>
            </View>

            {todayTips.length > 0 && (
              <View testID="insights-today-tips" style={styles.todayTipsBlock}>
                <Text style={styles.todayTipsLabel}>TODAY'S TIPS</Text>
                {todayTips.map((tip) => (
                  <View
                    key={`${tip.label}-${tip.text}`}
                    testID={`insights-today-tip-${tip.label.toLowerCase().replace(/\s+/g, '-')}`}
                    style={styles.todayTipRow}>
                    <Text style={styles.todayTipEmoji}>{tip.icon}</Text>
                    <View style={styles.todayTipCopy}>
                      <Text style={styles.todayTipLabel}>{tip.label}</Text>
                      <Text style={styles.todayTipText}>{tip.text}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
            </GradientCard>
          ) : (
            <Card testID="insights-today-empty" style={styles.todayCard}>
              <Text style={styles.todayKicker}>TODAY</Text>
              <Text style={styles.todayTitle}>Your phase will appear here</Text>
              <Text style={styles.todaySummary}>
                Log a period in Calendar to see today's phase, focus and tips.
              </Text>
            </Card>
          )}

          {/* Patterns */}
          <SectionHeader
            title="YOUR PATTERNS"
            meta={
              stats.trackedDays > 0
                ? `${stats.trackedDays} logged ${stats.trackedDays === 1 ? 'day' : 'days'}`
                : 'No logged days yet'
            }
            dotColor={theme.colors.primary}
          />

        {narrative.patterns.length > 0 ? (
          <View style={styles.patternsList}>
            {narrative.patterns.map((pattern) => (
              <Card
                key={pattern.id}
                testID={`insights-pattern-${pattern.id}`}
                style={styles.patternCard}
                padding={14}>
                <View style={styles.patternTop}>
                  <View style={styles.patternIcon}>
                    <Text style={styles.patternEmoji}>{pattern.icon}</Text>
                  </View>
                  <View style={styles.patternCopy}>
                    <Text style={styles.patternTitle}>{pattern.title}</Text>
                  </View>
                  <View style={styles.patternStat}>
                    <Text style={styles.patternStatValue}>{pattern.statValue}</Text>
                    <Text style={styles.patternStatLabel}>{pattern.statLabel}</Text>
                  </View>
                </View>
                <Text style={styles.patternBody}>{pattern.body}</Text>
                <Pill label={pattern.sampleLabel} tone="neutral" style={styles.samplePill} />

                {renderPatternVisual(pattern)}

                <View style={styles.patternTip}>
                  <Text style={styles.patternTipLabel}>{pattern.tipLabel}</Text>
                  <Text style={styles.patternTipText}>{pattern.tip}</Text>
                </View>
              </Card>
            ))}
          </View>
        ) : (
          <View style={styles.patternsEmptyWrap}>
            <EmptyState
              testID="insights-patterns-empty"
              title="Patterns need a little more data"
              body="Keep logging in Calendar — insights appear after a few cycles."
            />
          </View>
        )}

        {/* Phase guide */}
        <SectionHeader
          title="PHASE GUIDE"
          meta="General wellness tips"
          dotColor={theme.colors.teal}
        />

        <Card testID="insights-phase-tips-card" style={styles.phaseGuideCard} padding={16}>
          <View style={styles.phaseTabsRow}>
            {PHASE_ORDER.map((phase) => {
              const isSelected = activePhase === phase;
              const isCurrent = currentStatus?.phase === phase;
              return (
                <TouchableOpacity
                  key={phase}
                  testID={`insights-phase-tab-${phase}`}
                  style={[styles.phaseTab, isSelected && { backgroundColor: theme.colors.surface, borderColor: phaseColors[phase] }]}
                  onPress={() => setSelectedPhase(phase)}
                  accessibilityRole="tab"
                  accessibilityLabel={`${PHASE_LABELS[phase]}${isCurrent ? ', current phase' : ''}`}
                  accessibilityState={{ selected: isSelected }}>
                  <Text
                    style={[
                      styles.phaseTabText,
                      isSelected && { color: theme.colors.text, fontWeight: '800' },
                    ]}>
                    {PHASE_LABELS[phase]}
                  </Text>
                  {isCurrent && (
                    <View
                      style={[
                        styles.currentPhaseDot,
                        { backgroundColor: phaseColors[phase] },
                      ]}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {!currentStatus && (
            <Text testID="insights-phase-no-data" style={styles.phaseNoData}>
              Track your period to see which phase you're in. You can still browse all phases.
            </Text>
          )}

          <View style={styles.guidePhaseRow}>
            <View style={styles.guidePhaseMain}>
              <Text testID="insights-phase-summary-title" style={styles.guidePhaseTitle}>
                {phaseInfo.title}
              </Text>
              <Text style={styles.guideHormones}>Hormones · {phaseInfo.hormones}</Text>
            </View>
            <Text style={styles.guideDayRange}>{phaseInfo.dayRange}</Text>
          </View>

          {showPhaseSummary && (
            <>
              <Text style={styles.guideTagline}>{sentenceCase(phaseInfo.tagline)}</Text>
              <Text style={styles.guideSummary}>{phaseInfo.summary}</Text>
            </>
          )}

          <View style={styles.tipsList}>
            {phaseInfo.tips.map((tip) => (
              <View
                key={tip.category}
                testID={`insights-phase-tip-${tip.category}`}
                style={styles.tipItem}>
                <Text style={styles.tipEmoji}>{tip.iconEmoji}</Text>
                <View style={styles.tipCopy}>
                  <Text style={styles.tipCategory}>{tip.categoryLabel}</Text>
                  <Text style={styles.tipTitle}>{tip.title}</Text>
                  <Text style={styles.tipDescription}>{tip.description}</Text>
                </View>
              </View>
            ))}
          </View>

          <Text style={styles.guideNote}>
            Observations come from your own log and are not medical advice.
          </Text>
        </Card>
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
    todayCard: {
      marginHorizontal: 20,
      marginTop: 10,
    },
    todayTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    todayKicker: {
      ...typography.micro,
      color: theme.colors.textSecondary,
    },
    todayPill: {
      backgroundColor: theme.isDark ? '#2a1a20' : theme.colors.white,
      borderWidth: 1,
      borderColor: theme.isDark ? '#4a2836' : '#f3cddd',
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    todayPillText: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.4,
      color: theme.colors.primaryText,
    },
    todayTitle: {
      ...typography.todayTitle,
      color: theme.colors.text,
      marginTop: 9,
      marginBottom: 7,
    },
    todaySummary: {
      ...typography.body,
      color: theme.colors.textSecondary,
    },
    focusRow: {
      flexDirection: 'row',
      gap: 9,
      alignItems: 'flex-start',
      backgroundColor: theme.isDark ? theme.colors.surfaceTint : theme.colors.white,
      borderWidth: 1,
      borderColor: theme.isDark ? theme.colors.border : theme.colors.primarySoft,
      borderRadius: radii.button,
      padding: 10,
      marginTop: 11,
    },
    todayTipsBlock: {
      backgroundColor: theme.isDark ? theme.colors.tealSoft : '#f3fbf9',
      borderWidth: 1,
      borderColor: theme.isDark ? theme.colors.borderStrong : theme.colors.tealSoft,
      borderRadius: radii.button,
      padding: 10,
      marginTop: 11,
      gap: 8,
    },
    todayTipsLabel: {
      ...typography.micro,
      color: theme.colors.tealText,
    },
    todayTipRow: {
      flexDirection: 'row',
      gap: 9,
      alignItems: 'flex-start',
    },
    todayTipEmoji: {
      fontSize: 18,
      lineHeight: 21,
    },
    todayTipCopy: {
      flex: 1,
    },
    todayTipLabel: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.4,
      color: theme.colors.tealText,
    },
    todayTipText: {
      ...typography.caption,
      lineHeight: 17,
      color: theme.colors.text,
      marginTop: 1,
    },
    focusEmoji: {
      fontSize: 19,
      lineHeight: 22,
    },
    focusCopy: {
      flex: 1,
    },
    focusLabel: {
      ...typography.micro,
      color: theme.colors.primaryText,
    },
    focusTitle: {
      ...typography.rowTitle,
      color: theme.colors.text,
      marginTop: 1,
    },
    focusDesc: {
      ...typography.caption,
      lineHeight: 17,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    patternsList: {
      gap: 9,
      marginHorizontal: 20,
    },
    patternCard: {
      marginBottom: 8,
    },
    patternTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    patternIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: theme.colors.secondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    patternEmoji: {
      fontSize: 17,
    },
    patternCopy: {
      flex: 1,
    },
    patternTitle: {
      fontSize: 14,
      fontWeight: '800',
      lineHeight: 18,
      letterSpacing: -0.1,
      color: theme.colors.text,
    },
    patternBody: {
      ...typography.body,
      color: theme.colors.textSecondary,
      marginTop: 10,
    },
    samplePill: {
      marginTop: 6,
    },
    patternStat: {
      alignItems: 'flex-end',
      paddingLeft: 4,
    },
    patternStatValue: {
      fontSize: 18,
      fontWeight: '800',
      lineHeight: 21,
      letterSpacing: -0.4,
      color: theme.colors.text,
    },
    patternStatLabel: {
      fontSize: 9,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    miniPhaseBar: {
      flexDirection: 'row',
      height: 6,
      gap: 1.5,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: theme.colors.secondary,
      marginTop: 10,
    },
    miniPhaseLegend: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    miniPhaseLegendText: {
      fontSize: 10,
      color: theme.colors.textSecondary,
    },
    compareBars: {
      marginTop: 9,
      gap: 5,
    },
    compareRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    compareLabel: {
      width: 70,
      fontSize: 11,
      color: theme.colors.textSecondary,
    },
    compareTrack: {
      flex: 1,
      height: 6,
      borderRadius: 999,
      backgroundColor: theme.colors.secondary,
      overflow: 'hidden',
    },
    compareFill: {
      height: '100%',
      borderRadius: 999,
    },
    compareValue: {
      width: 24,
      textAlign: 'right',
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.text,
    },
    rangeStrip: {
      marginTop: 10,
    },
    rangeTrack: {
      height: 6,
      borderRadius: 999,
      backgroundColor: theme.colors.secondary,
      position: 'relative',
    },
    rangeFill: {
      position: 'absolute',
      left: '12%',
      right: '12%',
      top: 0,
      bottom: 0,
      borderRadius: 999,
      backgroundColor: theme.isDark ? '#5a2437' : '#f8bbd0',
    },
    rangeDot: {
      position: 'absolute',
      top: '50%',
      width: 10,
      height: 10,
      marginLeft: -5,
      marginTop: -5,
      borderRadius: 5,
      backgroundColor: theme.colors.primary,
      borderWidth: 2,
      borderColor: theme.colors.surface,
    },
    rangeLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    rangeLabel: {
      fontSize: 9,
      color: theme.colors.textSecondary,
    },
    patternTip: {
      flexDirection: 'column',
      gap: 6,
      alignItems: 'flex-start',
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      marginTop: 9,
      paddingTop: 8,
    },
    patternTipLabel: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.4,
      color: theme.colors.primaryText,
    },
    patternTipText: {
      flex: 1,
      fontSize: 11,
      lineHeight: 16,
      color: theme.colors.text,
    },
    patternsEmptyWrap: {
      marginHorizontal: 20,
    },
    phaseGuideCard: {
      marginHorizontal: 20,
      marginBottom: 24,
    },
    phaseTabsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 14,
    },
    phaseTab: {
      flex: 1,
      minHeight: 44,
      minWidth: 66,
      borderWidth: 1,
      borderColor: theme.colors.border,
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
    phaseNoData: {
      fontSize: 12,
      lineHeight: 17,
      color: theme.colors.textSecondary,
      fontStyle: 'italic',
      marginBottom: 12,
    },
    guidePhaseRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 8,
      marginBottom: 8,
    },
    guidePhaseMain: {
      flex: 1,
    },
    guidePhaseTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.text,
    },
    guideHormones: {
      fontSize: 11,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    guideDayRange: {
      fontSize: 11,
      color: theme.colors.textSecondary,
    },
    guideTagline: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.primary,
      marginTop: 2,
    },
    guideSummary: {
      ...typography.body,
      color: theme.colors.text,
      marginTop: 4,
      marginBottom: 2,
    },
    tipsList: {
      gap: 8,
      marginTop: 12,
    },
    tipItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 11,
      borderRadius: 11,
      backgroundColor: theme.colors.secondary,
    },
    tipEmoji: {
      fontSize: 19,
      lineHeight: 22,
    },
    tipCopy: {
      flex: 1,
    },
    tipCategory: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.5,
      color: theme.colors.primaryText,
    },
    tipTitle: {
      ...typography.rowTitle,
      color: theme.colors.text,
      marginTop: 2,
    },
    tipDescription: {
      ...typography.caption,
      lineHeight: 17,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    guideNote: {
      fontSize: 11,
      lineHeight: 16,
      color: theme.colors.textSecondary,
      fontStyle: 'italic',
      marginTop: 12,
    },
  });
