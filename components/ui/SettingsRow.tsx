import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import IconTile, { TileTone } from './IconTile';
import { spacing, typography } from '@/design/tokens';

interface SettingsRowProps {
  icon: React.ReactNode;
  tone?: TileTone;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  testID?: string;
  last?: boolean;
  titleColor?: string;
  /** Optional accessibility label for the row action. */
  accessibilityLabel?: string;
  disabled?: boolean;
}

/** A quiet settings row with a 30px tinted icon tile and optional trailing action. */
export default function SettingsRow({
  icon,
  tone = 'neutral',
  title,
  subtitle,
  right,
  onPress,
  testID,
  last = false,
  titleColor,
  accessibilityLabel,
  disabled = false,
}: SettingsRowProps) {
  const { theme } = useTheme();

  const content = (
    <>
      <IconTile size={30} tone={tone}>
        {icon}
      </IconTile>
      <View style={styles.copy}>
        <Text
          style={[
            typography.rowTitle,
            { color: titleColor ?? theme.colors.text },
          ]}>
          {title}
        </Text>
        {subtitle && (
          <Text style={[typography.caption, styles.subtitle, { color: theme.colors.textSecondary }]}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </>
  );

  const rowStyle = [
    styles.row,
    last && styles.last,
    { borderBottomColor: theme.colors.border },
    disabled && { opacity: 0.5 },
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityHint={subtitle}
        accessibilityState={{ disabled }}
        disabled={disabled}
        activeOpacity={0.7}
        onPress={onPress}
        style={rowStyle}>
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View testID={testID} style={rowStyle}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.base,
    borderBottomWidth: 1,
  },
  last: {
    borderBottomWidth: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  subtitle: {
    marginTop: 1,
  },
});
