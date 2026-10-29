import { TextStyle } from 'react-native';

/** The shared spacing scale from design/DESIGN.md. */
export const spacing = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 10,
  base: 12,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 24,
  huge: 32,
} as const;

/** Radius language: small controls -> cards -> pills. */
export const radii = {
  xs: 8,
  sm: 10,
  day: 11,
  button: 12,
  card: 16,
  hero: 18,
  pill: 999,
} as const;

/** Type scale. Colors are applied by the consumer, not baked into the tokens. */
export const typography: Record<string, TextStyle> = {
  display: {
    fontSize: 44,
    lineHeight: 48,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  pageTitle: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  pageSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  todayTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  cardTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  statValue: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  sectionLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  sectionMeta: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '500',
  },
  rowTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
  },
  caption: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  micro: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
};

export const cardShadow = (theme: any) => ({
  elevation: 2,
  shadowColor: theme.colors.shadowColor,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: theme.isDark ? 0.35 : 0.06,
  shadowRadius: 10,
});

export const floatingShadow = (theme: any) => ({
  elevation: 10,
  shadowColor: theme.colors.shadowColor,
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: theme.isDark ? 0.45 : 0.18,
  shadowRadius: 32,
});
