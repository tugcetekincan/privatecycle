import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { radii, spacing, typography } from '@/design/tokens';

interface EmptyStateProps {
  title: string;
  body?: string;
  icon?: React.ReactNode;
  testID?: string;
  /** Remove the dashed card when the empty state already sits inside a Card. */
  plain?: boolean;
}

/** A soft, dashed empty panel; explains what will unlock the content. */
export default function EmptyState({ title, body, icon, testID, plain = false }: EmptyStateProps) {
  const { theme } = useTheme();

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        plain && styles.plain,
        !plain && {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}>
      {icon && <View style={styles.icon}>{icon}</View>}
      <Text style={[typography.rowTitle, styles.title, { color: theme.colors.text }]}>
        {title}
      </Text>
      {body && (
        <Text style={[typography.caption, styles.body, { color: theme.colors.textSecondary }]}>
          {body}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radii.card,
    padding: spacing.xl,
    alignItems: 'center',
  },
  plain: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: spacing.lg,
  },
  icon: {
    marginBottom: spacing.sm,
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
    marginTop: spacing.xxs,
    lineHeight: 17,
  },
});
