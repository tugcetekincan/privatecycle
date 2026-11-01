import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { radii, spacing, typography } from '@/design/tokens';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  testID?: string;
}

/** Page title + subtitle + the 38px tinted icon tile used on every screen. */
export default function ScreenHeader({ title, subtitle, icon, testID }: ScreenHeaderProps) {
  const { theme } = useTheme();

  return (
    <View testID={testID} style={styles.header}>
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={[typography.pageTitle, { color: theme.colors.text }]}>{title}</Text>
        {subtitle && (
          <Text style={[typography.pageSubtitle, styles.subtitle, { color: theme.colors.textSecondary }]}>
            {subtitle}
          </Text>
        )}
      </View>
      <View
        style={[
          styles.iconTile,
          { backgroundColor: theme.colors.primarySoft },
        ]}>
        {icon}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.base,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.base,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  subtitle: {
    marginTop: 2,
  },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
