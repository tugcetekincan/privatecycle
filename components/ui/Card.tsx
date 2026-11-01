import React, { useId, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/hooks/useTheme';
import { cardShadow, radii, spacing } from '@/design/tokens';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  testID?: string;
  tone?: 'surface' | 'tint';
  padding?: number;
}

/** The standard 16px card. `tint` uses the warm blush surface. */
export function Card({ children, style, testID, tone = 'surface', padding = spacing.lg }: CardProps) {
  const { theme } = useTheme();

  return (
    <View
      testID={testID}
      style={[
        styles.card,
        cardShadow(theme),
        {
          backgroundColor: tone === 'tint' ? theme.colors.surfaceTint : theme.colors.surface,
          borderColor: tone === 'tint' ? theme.colors.primarySoft : theme.colors.border,
          padding,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

interface GradientCardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  testID?: string;
  from?: string;
  to?: string;
}

/**
 * A hero/Today surface with a subtle SVG gradient. Keeping the gradient on an
 * inner clipped view lets the outer view keep its shadow.
 */
export function GradientCard({
  children,
  style,
  testID,
  from,
  to,
}: GradientCardProps) {
  const { theme } = useTheme();
  const gradientId = `pc-gradient-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const start = from ?? theme.colors.surface;
  const end = to ?? theme.colors.primarySoft;

  return (
    <View
      testID={testID}
      style={[
        styles.shadow,
        cardShadow(theme),
        { backgroundColor: theme.colors.surface },
        style,
      ]}>
      <View
        onLayout={({ nativeEvent: { layout } }) => setSize(previous =>
          previous.width === layout.width && previous.height === layout.height
            ? previous : { width: layout.width, height: layout.height })}
        style={[
          styles.clip,
          {
            backgroundColor: start,
            borderColor: theme.isDark ? theme.colors.border : theme.colors.primarySoft,
          },
        ]}>
        <Svg
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          width={size.width}
          height={size.height}>
          <Defs>
            <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={start} />
              <Stop offset="1" stopColor={end} />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
        </Svg>
        <View style={styles.content}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
  },
  shadow: {
    borderRadius: radii.hero,
  },
  clip: {
    borderRadius: radii.hero,
    borderWidth: 1,
    overflow: 'hidden',
  },
  content: {
    padding: spacing.xl,
  },
});
