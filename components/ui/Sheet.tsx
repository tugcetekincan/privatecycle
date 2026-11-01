import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { radii, spacing, typography } from '@/design/tokens';

interface SheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  testID: string;
  closeTestID: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  compact?: boolean;
}

/** Shared entry sheet: reachable actions above the system bar and keyboard. */
export default function Sheet({ visible, title, subtitle, testID, closeTestID, onClose, children, footer, compact = false }: SheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  return (
    <Modal visible={visible} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View testID={testID} accessibilityViewIsModal style={[styles.sheet, compact && { height: '66%' }, { backgroundColor: theme.colors.background, marginTop: insets.top + spacing.xxl }]}>
          <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />
          <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
            <View style={styles.copy}>
              <Text accessibilityRole="header" style={[typography.cardTitle, { color: theme.colors.text }]}>{title}</Text>
              {subtitle && <Text style={[typography.caption, styles.subtitle, { color: theme.colors.textSecondary }]}>{subtitle}</Text>}
            </View>
            <TouchableOpacity testID={closeTestID} accessibilityRole="button" accessibilityLabel="Close sheet" onPress={onClose} activeOpacity={0.7} style={[styles.close, { backgroundColor: theme.colors.secondary }]}>
              <X size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            {children}
          </ScrollView>
          <View style={[styles.footer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border, paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            {footer}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  sheet: { height: '86%', maxHeight: '94%', width: '100%', maxWidth: 600, alignSelf: 'center', borderTopLeftRadius: radii.hero, borderTopRightRadius: radii.hero, overflow: 'hidden' },
  handle: { width: 32, height: 4, borderRadius: radii.pill, alignSelf: 'center', marginTop: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, paddingHorizontal: spacing.xxl, paddingVertical: spacing.base, borderBottomWidth: 1 },
  copy: { flex: 1, minWidth: 0 },
  subtitle: { marginTop: spacing.xxs },
  close: { width: 44, height: 44, borderRadius: radii.button, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingVertical: spacing.sm },
  footer: { paddingHorizontal: spacing.xxl, paddingTop: spacing.base, borderTopWidth: 1 },
});
