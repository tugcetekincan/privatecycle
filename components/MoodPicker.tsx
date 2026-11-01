import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { cardShadow, radii, spacing, typography } from '@/design/tokens';
import { MoodTag, MoodValue, MOOD_OPTIONS, MOOD_TAG_MAX_LEVEL, cycleMoodTag, removeMoodTag } from '@/services/MoodTags';

/**
 * Mix 1 mood picker: an optional one-tap overall face (valence 1-5) plus
 * multi-select feeling chips where tapping again raises intensity
 * (1 -> 2 -> 3 -> 1) and the small ✕ removes the chip.
 *
 * Used by the Calendar day modal with auto-save on every change.
 */

// Intentional period-pink accents (same hardcoded values used elsewhere in the app).
const PINK = '#e91e63';

// On the web build some Linux font stacks (DejaVu Sans) claim emoji codepoints
// and render them as monochrome line art. Pinning color-emoji families first
// keeps the faces consistent; other platforms use their native emoji fonts.
const emojiFontOnWeb = Platform.select({
  web: { fontFamily: '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif' },
  default: {},
});

const MOOD_VALENCES = [
  { value: 1, icon: '😞', label: 'Rough' },
  { value: 2, icon: '😕', label: 'Low' },
  { value: 3, icon: '😐', label: 'Okay' },
  { value: 4, icon: '🙂', label: 'Good' },
  { value: 5, icon: '😄', label: 'Great' },
];

interface MoodPickerProps {
  valence: number;
  tags: MoodTag[];
  /** Show the transient "✓ Saved" indicator (auto-save feedback). */
  saved?: boolean;
  onChange: (next: MoodValue) => void;
  /** testID prefix; the calendar day modal uses `day-modal-mood`. */
  testIDPrefix?: string;
  /** Smaller card title, for embedding in the day modal. */
  compact?: boolean;
}

export default function MoodPicker({
  valence,
  tags,
  saved,
  onChange,
  testIDPrefix = 'mood',
  compact = false,
}: MoodPickerProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const handleFacePress = (value: number) => {
    // Tapping the selected face clears it — the overall mood is optional.
    onChange({ valence: valence === value ? 0 : value, tags });
  };

  const handleTagPress = (id: string) => {
    onChange({ valence, tags: cycleMoodTag(tags, id) });
  };

  const handleTagRemove = (id: string) => {
    onChange({ valence, tags: removeMoodTag(tags, id) });
  };

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={[styles.cardTitle, compact && styles.cardTitleCompact]}>Mood</Text>
        <Text testID={saved ? `${testIDPrefix}-saved` : undefined} accessibilityLiveRegion="polite" style={[styles.savedPill, !saved && { color: theme.colors.textSecondary, backgroundColor: theme.colors.secondary }]}>
          {saved ? '✓ Saved' : 'Auto-saves'}
        </Text>
      </View>

      <Text style={styles.sectionLabel}>THE DAY, OVERALL</Text>
      <View style={styles.facesRow}>
        {MOOD_VALENCES.map((face) => {
          const selected = valence === face.value;
          return (
            <TouchableOpacity
              key={face.value}
              testID={`${testIDPrefix}-valence-${face.value}`}
              accessibilityRole="button"
              accessibilityLabel={`Overall mood: ${face.label}`}
              accessibilityState={{ selected }}
              style={[styles.face, selected && styles.faceSelected]}
              onPress={() => handleFacePress(face.value)}>
              <Text style={styles.faceEmoji}>{face.icon}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.faceLegend}>
        <Text style={styles.legendText}>Rough</Text>
        <Text style={styles.legendText}>Great</Text>
      </View>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>FEELINGS — TAP AGAIN FOR STRENGTH</Text>
      <View style={styles.chipsWrap}>
        {MOOD_OPTIONS.map((option) => {
          const tag = tags.find((t) => t.id === option.id);
          const selected = tag !== undefined;
          const solid = tag?.level === MOOD_TAG_MAX_LEVEL;
          return (
            <View key={option.id} style={[styles.chipWrapper, selected && styles.chipGroupSelected, solid && styles.chipGroupSolid]}>
              <TouchableOpacity
                testID={`${testIDPrefix}-tag-${option.id}`}
                accessibilityRole="button"
                accessibilityLabel={
                  selected ? `${option.label}, strength ${tag!.level} of 3` : option.label
                }
                accessibilityState={{ selected }}
                style={[styles.chip, selected && styles.chipSelected, solid && styles.chipSolid]}
                onPress={() => handleTagPress(option.id)}>
                <Text style={styles.chipEmoji}>{option.icon}</Text>
                <Text
                  style={[
                    styles.chipText,
                    selected && styles.chipTextSelected,
                    solid && styles.chipTextSolid,
                  ]}>
                  {option.label}
                </Text>
                {selected && (
                  <View style={styles.dots}>
                    {[1, 2, 3].map((dot) => (
                      <View
                        key={dot}
                        style={[
                          styles.dot,
                          dot <= tag!.level && (solid ? styles.dotOnSolid : styles.dotOn),
                        ]}
                      />
                    ))}
                  </View>
                )}
              </TouchableOpacity>
              {selected && (
                <TouchableOpacity
                  testID={`${testIDPrefix}-tag-${option.id}-clear`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${option.label}`}
                  hitSlop={4}
                  style={styles.clearBadge}
                  onPress={() => handleTagRemove(option.id)}>
                  <Text style={[styles.clearText, solid && { color: theme.colors.white }]}>×</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      marginHorizontal: 20,
      marginVertical: 8,
      padding: 16,
      borderRadius: radii.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...cardShadow(theme),
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cardTitle: {
      ...typography.cardTitle,
      color: theme.colors.text,
    },
    cardTitleCompact: {
      fontSize: 18,
    },
    savedPill: {
      overflow: 'hidden',
      fontSize: 10,
      fontWeight: '800',
      color: theme.colors.successText,
      backgroundColor: theme.colors.successSoft,
      borderRadius: radii.pill,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    sectionLabel: {
      ...typography.micro,
      color: theme.colors.textSecondary,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    facesRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 2,
    },
    face: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    faceSelected: {
      backgroundColor: PINK,
      borderColor: PINK,
      shadowColor: PINK,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.35,
      shadowRadius: 6,
      elevation: 3,
    },
    faceEmoji: {
      fontSize: 23,
      ...emojiFontOnWeb,
    },
    faceLegend: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 6,
      paddingHorizontal: 6,
    },
    legendText: {
      fontSize: 10,
      color: theme.colors.textSecondary,
    },
    divider: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginTop: 16,
    },
    chipWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radii.pill,
      overflow: 'hidden',
    },
    chipGroupSelected: { borderWidth: 1, borderColor: PINK, backgroundColor: theme.colors.primarySoft },
    chipGroupSolid: { backgroundColor: PINK },
    chip: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      gap: 5,
    },
    chipSelected: {
      backgroundColor: 'transparent',
      borderWidth: 0,
    },
    chipSolid: {
      backgroundColor: PINK,
      borderColor: PINK,
    },
    chipEmoji: {
      fontSize: 14,
      ...emojiFontOnWeb,
    },
    chipText: {
      ...typography.caption,
      color: theme.colors.text,
    },
    chipTextSelected: {
      color: theme.colors.primaryText,
      fontWeight: '600',
    },
    chipTextSolid: {
      color: '#fff',
    },
    chipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: 10,
      rowGap: 16,
      paddingTop: 2,
    },
    dots: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginLeft: 3,
    },
    dot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: '#d6d6d6',
    },
    dotOn: {
      backgroundColor: PINK,
    },
    dotOnSolid: {
      backgroundColor: '#fff',
    },
    clearBadge: {
      width: 44,
      height: 44,
      borderLeftWidth: 1,
      borderColor: theme.colors.primaryWeak,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clearText: {
      fontSize: 20,
      lineHeight: 24,
      color: theme.colors.primaryText,
    },
  });
