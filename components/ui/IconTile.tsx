import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { radii } from '@/design/tokens';

export type TileTone = 'primary' | 'success' | 'warning' | 'teal' | 'neutral';

interface IconTileProps {
  children: React.ReactNode;
  size?: number;
  tone?: TileTone;
  style?: ViewStyle;
}

/** Small tinted tile behind a lucide icon, used in headers, rows and cards. */
export default function IconTile({
  children,
  size = 34,
  tone = 'neutral',
  style,
}: IconTileProps) {
  const { theme } = useTheme();

  const background: Record<TileTone, string> = {
    primary: theme.colors.primarySoft,
    success: theme.colors.successSoft,
    warning: theme.colors.warningSoft,
    teal: theme.colors.tealSoft,
    neutral: theme.colors.secondary,
  };

  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: size <= 32 ? radii.sm : radii.button,
          backgroundColor: background[tone],
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
