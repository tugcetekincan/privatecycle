import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { cardShadow, radii, spacing } from '@/design/tokens';
import {
  tidemarkHeroGeometry,
  tidemarkHeroMarker,
  tidemarkPrivacyGeometry,
  tidemarkPrivacyMarker,
} from './tidemarkGeometry';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKS = [
  [3, 4, 5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14, 15, 16],
  [17, 18, 19, 20, 21, 22, 23],
  [24, 25, 26, 27, 28, 29, 30],
];
const SELECTED_DAY = 14;

/** The large, cropped tide on screen 1. */
export function TidemarkArcHero() {
  const { theme } = useTheme();
  const { center, arcs, marker, viewBox } = tidemarkHeroGeometry;

  return (
    <View
      testID="first-run-arc-illustration"
      accessible={false}
      accessibilityElementsHidden
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={styles.heroArt}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
        preserveAspectRatio="xMidYMid slice">
        {arcs.map((arc, index) => (
          <Circle
            key={index}
            cx={center.cx}
            cy={center.cy}
            r={arc.radius}
            fill="none"
            stroke={theme.colors.primaryWeak}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
        <Circle
          cx={tidemarkHeroMarker.x}
          cy={tidemarkHeroMarker.y}
          r={marker.haloRadius}
          fill="none"
          stroke={theme.colors.primaryWeak}
          strokeWidth={1.2}
        />
        <Circle
          cx={tidemarkHeroMarker.x}
          cy={tidemarkHeroMarker.y}
          r={marker.dotRadius}
          fill={theme.colors.primary}
        />
      </Svg>
    </View>
  );
}

/**
 * Screen 2's calendar is an illustration, not a log. The date grid is hidden
 * from assistive tech and never reads or writes DataService.
 */
export function TidemarkCalendarIllustration() {
  const { theme } = useTheme();

  return (
    <View testID="first-run-calendar-illustration">
      <View style={styles.illustrationLabelRow}>
        <Text
          testID="first-run-illustration-label"
          style={[styles.illustrationLabel, { color: theme.colors.textSecondary }]}>
          ILLUSTRATION
        </Text>
        <View style={[styles.illustrationRule, { backgroundColor: theme.colors.border }]} />
      </View>

      <View
        testID="first-run-calendar-decorative"
        accessible={false}
        accessibilityElementsHidden
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.calendarCard,
          cardShadow(theme),
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}>
        <View style={styles.calendarHead}>
          <View style={styles.calendarMonthRow}>
            <Text
              allowFontScaling={false}
              style={[styles.calendarMonth, { color: theme.colors.text }]}>
              May
            </Text>
            <Text
              allowFontScaling={false}
              style={[styles.calendarYear, { color: theme.colors.textSecondary }]}>
              2026
            </Text>
          </View>
          <View style={styles.calendarNav}>
            <ChevronLeft size={14} color={theme.colors.textSecondary} />
            <ChevronRight size={14} color={theme.colors.textSecondary} />
          </View>
        </View>

        <View style={[styles.calendarDivider, { backgroundColor: theme.colors.border }]} />

        <View style={styles.calendarWeekRow}>
          {WEEKDAYS.map((day, index) => (
            <Text
              key={`${day}-${index}`}
              allowFontScaling={false}
              style={[styles.calendarWeekday, { color: theme.colors.textSecondary }]}>
              {day}
            </Text>
          ))}
        </View>

        {WEEKS.map((week) => (
          <View key={week[0]} style={styles.calendarWeekRow}>
            {week.map((day) => (
              <View key={day} style={styles.calendarDayCell}>
                {day === SELECTED_DAY ? (
                  <View
                    style={[
                      styles.calendarSelectedDay,
                      { borderColor: theme.colors.primary },
                    ]}>
                    <Text
                      allowFontScaling={false}
                      style={[styles.calendarSelectedText, { color: theme.colors.primaryText }]}>
                      {day}
                    </Text>
                  </View>
                ) : (
                  <Text
                    allowFontScaling={false}
                    style={[styles.calendarDay, { color: theme.colors.textSecondary }]}>
                    {day}
                  </Text>
                )}
              </View>
            ))}
          </View>
        ))}

        <View style={[styles.calendarFoot, { borderTopColor: theme.colors.border }]}>
          <View style={[styles.periodChip, { backgroundColor: theme.colors.primarySoft }]}>
            <View style={[styles.periodChipDot, { backgroundColor: theme.colors.primary }]} />
            <Text
              allowFontScaling={false}
              style={[styles.periodChipText, { color: theme.colors.primaryText }]}>
              Period
            </Text>
          </View>
          <Text
            allowFontScaling={false}
            style={[styles.calendarHint, { color: theme.colors.textSecondary }]}>
            First day
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Screen 3's device + exported backup, cradled by a second tide. */
export function TidemarkPrivacyIllustration() {
  const { theme } = useTheme();
  const { center, arcs, marker, viewBox } = tidemarkPrivacyGeometry;
  const line = theme.colors.primaryWeak;

  return (
    <View
      testID="first-run-backup-illustration"
      accessible={false}
      accessibilityElementsHidden
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={styles.privacyArt}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
        preserveAspectRatio="xMidYMid meet">
        {arcs.map((arc, index) => (
          <Circle
            key={index}
            cx={center.cx}
            cy={center.cy}
            r={arc.radius}
            fill="none"
            stroke={line}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}

        <Circle
          cx={tidemarkPrivacyMarker.x}
          cy={tidemarkPrivacyMarker.y}
          r={marker.haloRadius}
          fill="none"
          stroke={line}
          strokeWidth={1}
        />
        <Circle
          cx={tidemarkPrivacyMarker.x}
          cy={tidemarkPrivacyMarker.y}
          r={marker.dotRadius}
          fill={theme.colors.primary}
        />

        <G transform="rotate(-7 99 162)">
          <Path
            d="M56 110h58l28 28v72a8 8 0 0 1-8 8H56a8 8 0 0 1-8-8v-92a8 8 0 0 1 8-8z"
            fill={theme.colors.surface}
            stroke={line}
            strokeWidth={1.5}
          />
          <Path
            d="M114 110v28h28"
            fill="none"
            stroke={line}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          <Path
            d="M64 152h54M64 166h54M64 180h34"
            fill="none"
            stroke={line}
            strokeWidth={1.4}
            strokeLinecap="round"
            opacity={0.65}
          />
          <Rect
            x={64}
            y={126}
            width={21}
            height={7}
            rx={3.5}
            fill={theme.colors.primarySoft}
          />
        </G>

        <Rect
          x={208}
          y={34}
          width={88}
          height={164}
          rx={18}
          fill={theme.colors.surface}
          stroke={line}
          strokeWidth={1.6}
        />
        <Rect
          x={216}
          y={46}
          width={72}
          height={140}
          rx={10}
          fill={theme.colors.primarySoft}
          opacity={0.45}
        />
        <Path
          d="M240 40h24"
          fill="none"
          stroke={line}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <Rect
          x={240}
          y={108}
          width={22}
          height={18}
          rx={5}
          fill={theme.colors.surface}
          stroke={line}
          strokeWidth={1.2}
        />
        <Path
          d="M245 108v-4a6 6 0 0 1 12 0v4"
          fill="none"
          stroke={line}
          strokeWidth={1.3}
          strokeLinecap="round"
        />
        <Circle cx={251} cy={116} r={1.8} fill={theme.colors.primary} />

        <Path
          d="M148 152c16-13 32-15 50-9"
          fill="none"
          stroke={line}
          strokeWidth={1.4}
          strokeDasharray="2 6"
          strokeLinecap="round"
        />
        <Path
          d="m192 139 7 4-6 4"
          fill="none"
          stroke={theme.colors.primaryText}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  heroArt: {
    width: '100%',
    height: 330,
  },
  illustrationLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  illustrationLabel: {
    fontSize: 8.5,
    letterSpacing: 1.6,
    fontWeight: '800',
  },
  illustrationRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  calendarCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: spacing.lg,
  },
  calendarHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarMonthRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  calendarMonth: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  calendarYear: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  calendarNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  calendarDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  calendarWeekRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  calendarWeekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 1,
  },
  calendarDayCell: {
    flex: 1,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDay: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  calendarSelectedDay: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarSelectedText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  calendarFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  periodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  periodChipDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  periodChipText: {
    fontSize: 9,
    fontWeight: '800',
  },
  calendarHint: {
    fontSize: 9.5,
  },
  privacyArt: {
    width: '100%',
    aspectRatio: tidemarkPrivacyGeometry.viewBox.width / tidemarkPrivacyGeometry.viewBox.height,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
});
