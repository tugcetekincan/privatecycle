import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { radii, spacing, typography } from '@/design/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  testID?: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

/** The main 50px action button used in the day modal and empty flows. */
export default function PrimaryButton({
  title,
  onPress,
  testID,
  variant = 'primary',
  disabled = false,
  icon,
  style,
}: PrimaryButtonProps) {
  const { theme } = useTheme();

  const palette: Record<ButtonVariant, { background: string; border: string; text: string }> = {
    primary: { background: theme.colors.primary, border: theme.colors.primary, text: theme.colors.white },
    secondary: {
      background: theme.colors.surface,
      border: theme.colors.borderStrong,
      text: theme.colors.primary,
    },
    destructive: {
      background: theme.colors.surface,
      border: theme.colors.error,
      text: theme.colors.error,
    },
  };
  const colors = palette[variant];

  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      activeOpacity={0.8}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}>
      {icon}
      <Text style={[typography.body, styles.text, { color: colors.text }]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: radii.button,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  text: {
    fontSize: 15,
    fontWeight: '700',
  },
});
