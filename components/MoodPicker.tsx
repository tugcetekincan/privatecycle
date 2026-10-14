import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { MoodTag, MoodValue, MOOD_TAG_MAX_LEVEL, cycleMoodTag, removeMoodTag } from '@/services/MoodTags';

/**
 * Mix 1 mood picker: an optional one-tap overall face (valence 1-5) plus
 * multi-select feeling chips where tapping again raises intensity
 * (1 -> 2 -> 3 -> 1) and the small ✕ removes the chip.
 *
 * Used by the Track screen with auto-save on every change.
 */

// Intentional period-pink accents (same hardcoded values used elsewhere in the app).
const PINK = '#e91e63';
const PINK_SOFT = '#fce4ec';
const PINK_DEEP = '#c2185b';

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

export const MOOD_OPTIONS = [
  { id: 'happy', label: 'Happy', icon: '😊' },
  { id: 'calm', label: 'Calm', icon: '😌' },
  { id: 'energetic', label: 'Energetic', icon: '⚡' },
  { id: 'tired', label: 'Tired', icon: '😴' },
  { id: 'low', label: 'Low', icon: '😔' },
  { id: 'anxious', label: 'Anxious', icon: '😰' },
  { id: 'irritable', label: 'Irritable', icon: '😤' },
  { id: 'overwhelmed', label: 'Overwhelmed', icon: '😩' },
];

interface MoodPickerProps {
  valence: number;
  tags: MoodTag[];
  /** Show the transient "✓ Saved" indicator (auto-save feedback). */
  saved?: boolean;
  onChange: (next: MoodValue) => void;
}

export default function MoodPicker({ valence, tags, saved, onChange }: MoodPickerProps) {
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
        <Text style={styles.cardTitle}>Mood</Text>
        {saved && (
          <Text testID="mood-saved" style={styles.savedPill}>
            ✓ Saved
          </Text>
        )}
      </View>

      <Text style={styles.sectionLabel}>The day, overall</Text>
      <View style={styles.facesRow}>
        {MOOD_VALENCES.map((face) => {
          const selected = valence === face.value;
          return (
            <TouchableOpacity
              key={face.value}
              testID={`mood-valence-${face.value}`}
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

      <Text style={styles.sectionLabel}>Feelings — tap again for strength</Text>
      <View style={styles.chipsWrap}>
        {MOOD_OPTIONS.map((option) => {
          const tag = tags.find((t) => t.id === option.id);
          const selected = tag !== undefined;
          const solid = tag?.level === MOOD_TAG_MAX_LEVEL;
          return (
            <View key={option.id} style={styles.chipWrapper}>
              <TouchableOpacity
                testID={`mood-tag-${option.id}`}
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
                  testID={`mood-tag-${option.id}-clear`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${option.label}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.clearBadge}
                  onPress={() => handleTagRemove(option.id)}>
                  <Text style={styles.clearText}>×</Text>
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
      marginVertical: 10,
      padding: 20,
      borderRadius: 12,
      elevation: 2,
      shadowColor: theme.colors.shadowColor,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cardTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.text,
    },
    savedPill: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.accent,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginTop: 16,
      marginBottom: 10,
    },
    facesRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 2,
    },
    face: {
      width: 44,
      height: 44,
      borderRadius: 22,
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
      position: 'relative',
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 7,
      paddingHorizontal: 11,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      gap: 5,
    },
    chipSelected: {
      backgroundColor: PINK_SOFT,
      borderColor: PINK,
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
      fontSize: 13,
      color: theme.colors.text,
    },
    chipTextSelected: {
      color: PINK_DEEP,
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
      position: 'absolute',
      top: -8,
      right: -8,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: '#cfd3da',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
      elevation: 4,
    },
    clearText: {
      fontSize: 13,
      lineHeight: 16,
      color: '#8a8f98',
    },
  });
