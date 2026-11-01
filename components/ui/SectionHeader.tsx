import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { spacing, typography } from '@/design/tokens';

interface SectionHeaderProps {
  title: string;
  meta?: string;
  dotColor?: string;
  style?: ViewStyle;
  testID?: string;
}

/** Colored dot + literal uppercase label + optional right-hand meta. */
export default function SectionHeader({
  title,
  meta,
  dotColor,
  style,
  testID,
}: SectionHeaderProps) {
  const { theme } = useTheme();

  return (
    <View testID={testID} style={[styles.row, style]}>
      <View style={styles.left}>
        {dotColor && <View style={[styles.dot, { backgroundColor: dotColor }]} />}
        <Text accessibilityRole="header" style={[typography.sectionLabel, styles.label, { color: theme.colors.textSecondary }]}>
          {title}
        </Text>
      </View>
      {meta && (
        <Text style={[typography.sectionMeta, styles.meta, { color: theme.colors.textSecondary }]}>{meta}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: 22,
    marginTop: spacing.xxl,
    marginBottom: spacing.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
  },
  label: { flexShrink: 1 },
  meta: { flexShrink: 1, textAlign: 'right' },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
