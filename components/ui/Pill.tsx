import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { radii, spacing, typography } from '@/design/tokens';

export type PillTone = 'primary' | 'success' | 'warning' | 'teal' | 'neutral';

interface PillProps {
  label: string;
  tone?: PillTone;
  dot?: boolean;
  style?: ViewStyle;
  testID?: string;
}

export default function Pill({ label, tone = 'primary', dot, style, testID }: PillProps) {
  const { theme } = useTheme();

  const palette: Record<PillTone, { background: string; color: string }> = {
    primary: { background: theme.colors.primarySoft, color: theme.colors.primary },
    success: { background: theme.colors.successSoft, color: theme.colors.success },
    warning: { background: theme.colors.warningSoft, color: theme.colors.warning },
    teal: { background: theme.colors.tealSoft, color: theme.colors.teal },
    neutral: { background: theme.colors.secondary, color: theme.colors.textSecondary },
  };
  const colors = palette[tone];

  return (
    <View
      testID={testID}
      style={[styles.pill, { backgroundColor: colors.background }, style]}>
      {dot && <View style={[styles.dot, { backgroundColor: colors.color }]} />}
      <Text style={[typography.caption, styles.text, { color: colors.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
  },
});
