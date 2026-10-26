import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Lock,
  Shield,
  Trash2,
  X,
} from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useDialog } from '@/hooks/useDialog';
import { usePrivateGate } from '@/components/PrivateGate';
import { usePrivateScreenProtection } from '@/hooks/usePrivateScreenProtection';
import { DataService } from '@/services/DataService';
import type { IntimateData, ProtectionMethod } from '@/services/DataService';
import { formatDateKey, parseDateKey } from '@/services/dateKey';
import { PROTECTION_OPTIONS, summarizeIntimacy } from '@/services/IntimacyService';
import { PrivateAccessService } from '@/services/PrivateAccessService';
import {
  isValidPin,
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
} from '@/services/privateAccess/pin';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const sanitizePin = (value: string): string =>
  value.replace(/\D/g, '').slice(0, PIN_MAX_LENGTH);

const formatShortDate = (dateKey: string): string => {
  const date = parseDateKey(dateKey);
  const includeYear = date.getFullYear() !== new Date().getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  });
};

export default function PrivateCalendar() {
  const { theme } = useTheme();
  const { showError, showInfo, showSuccess, showConfirm, DialogComponent } = useDialog();
  const { lock } = usePrivateGate();
  const router = useRouter();

  usePrivateScreenProtection();

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [data, setData] = useState<IntimateData>({});
  const [loading, setLoading] = useState(true);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [activity, setActivity] = useState(false);
  const [protection, setProtection] = useState<ProtectionMethod>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const [backupEnabled, setBackupEnabled] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);

  const [changePinVisible, setChangePinVisible] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinBusy, setPinBusy] = useState(false);

  const loadData = useCallback(async () => {
    const next = await DataService.getIntimateData();
    setData(next);
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const next = await DataService.getIntimateData();
        let backup = false;
        try {
          backup = await PrivateAccessService.isBackupEnabled();
        } catch {
          // A preference read failure should not hide the calendar.
        }
        if (!active) return;
        setData(next);
        setBackupEnabled(backup);
      } catch (error) {
        console.error('Error loading private calendar:', error);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => summarizeIntimacy(data, currentMonth), [data, currentMonth]);
  const styles = createStyles(theme);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const leadingBlanks = firstDay === 0 ? 6 : firstDay - 1;

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < leadingBlanks; i++) {
    cells.push(<View key={`blank-${i}`} style={styles.dayCell} />);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dayKey = formatDateKey(date);
    const logged = Boolean(data[dayKey]);
    const isToday = dayKey === formatDateKey(new Date());

    cells.push(
      <TouchableOpacity
        key={dayKey}
        testID={`private-day-${dayKey}`}
        style={[styles.dayCell, isToday && styles.todayCell]}
        onPress={() => openDay(date)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${date.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
        })}${logged ? ', activity logged' : ''}`}>
        <Text style={[styles.dayText, isToday && styles.todayText]}>{day}</Text>
        {logged && (
          <View testID={`private-day-logged-${dayKey}`} style={styles.loggedDot} />
        )}
      </TouchableOpacity>
    );
  }

  function navigateMonth(offset: number) {
    setCurrentMonth(new Date(year, month + offset, 1));
  }

  function openDay(date: Date) {
    const dayKey = formatDateKey(date);
    const existing = data[dayKey];
    setSelectedDate(date);
    setActivity(Boolean(existing));
    setProtection(existing?.protection ?? '');
    setNote(existing?.note ?? '');
    setModalVisible(true);
  }

  function closeDay() {
    setModalVisible(false);
    setSelectedDate(null);
    setSaving(false);
  }

  async function saveDay() {
    if (!selectedDate) return;

    const dateKey = formatDateKey(selectedDate);
    setSaving(true);
    try {
      if (activity) {
        await DataService.saveIntimateDay({
          date: dateKey,
          protection,
          note: note.trim(),
        });
      } else {
        await DataService.deleteIntimateDay(dateKey);
      }
      await loadData();
      closeDay();
    } catch (error) {
      console.error('Error saving private calendar entry:', error);
      showError('Error', 'Could not save this entry. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function deleteDay() {
    if (!selectedDate) return;

    const dateKey = formatDateKey(selectedDate);
    showConfirm(
      'Delete entry',
      'Remove this day from the private calendar?',
      async () => {
        try {
          await DataService.deleteIntimateDay(dateKey);
          await loadData();
          closeDay();
        } catch (error) {
          console.error('Error deleting private calendar entry:', error);
          showError('Error', 'Could not delete this entry. Please try again.');
        }
      },
      undefined,
      'Delete',
      'Cancel',
      true
    );
  }

  async function handleBackupToggle(value: boolean) {
    setBackupBusy(true);
    try {
      await PrivateAccessService.setBackupEnabled(value);
      setBackupEnabled(value);
      if (value) {
        showInfo(
          'Backups include private activity',
          'Exported and automatic backup files will contain this calendar. Store them somewhere you trust.'
        );
      }
    } catch (error) {
      console.error('Error updating private backup preference:', error);
      showError('Error', 'Could not update the backup setting.');
    } finally {
      setBackupBusy(false);
    }
  }

  function openChangePin() {
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setPinError('');
    setChangePinVisible(true);
  }

  function closeChangePin() {
    if (pinBusy) return;
    setChangePinVisible(false);
  }

  async function saveNewPin() {
    if (!isValidPin(currentPin)) {
      setPinError(`Enter your current ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digit PIN.`);
      return;
    }
    if (!isValidPin(newPin)) {
      setPinError(`Choose a ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digit PIN.`);
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('The new PINs do not match.');
      return;
    }

    setPinBusy(true);
    setPinError('');
    try {
      const result = await PrivateAccessService.changePin(currentPin, newPin);
      if (!result.ok) {
        if (result.reason === 'locked') {
          const seconds = Math.max(1, Math.ceil((result.retryAfterMs ?? 0) / 1000));
          setPinError(`Too many attempts. Try again in ${seconds}s.`);
        } else if (result.reason === 'missing') {
          setPinError('No PIN is set. Reopen the private calendar.');
        } else {
          setPinError('Current PIN is incorrect.');
        }
        return;
      }

      setChangePinVisible(false);
      showSuccess('PIN updated', 'Use the new PIN the next time you open the private calendar.');
    } catch (error) {
      console.error('Error changing private PIN:', error);
      setPinError('Could not update the PIN. Please try again.');
    } finally {
      setPinBusy(false);
    }
  }

  function clearPrivateData() {
    showConfirm(
      'Delete private activity',
      'This permanently deletes every private calendar entry in the app. Your PIN stays, and existing backup files are not changed. This cannot be undone.',
      async () => {
        try {
          await DataService.clearIntimateData();
          await loadData();
          showSuccess('Deleted', 'All private calendar entries were removed.');
        } catch (error) {
          console.error('Error clearing private calendar data:', error);
          showError('Error', 'Could not delete the private calendar data.');
        }
      },
      undefined,
      'Delete',
      'Cancel',
      true
    );
  }

  function closeRoute() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings');
    }
  }

  const selectedDateLabel = selectedDate?.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const existingEntry = selectedDate ? data[formatDateKey(selectedDate)] : undefined;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Intimacy</Text>
            <Text style={styles.subtitle}>Private calendar</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              testID="private-lock"
              onPress={lock}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel="Lock private calendar">
              <Lock size={22} color={theme.colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              testID="private-close"
              onPress={closeRoute}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel="Close private calendar">
              <X size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <View testID="private-calendar" style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <TouchableOpacity
              testID="private-prev-month"
              onPress={() => navigateMonth(-1)}
              style={styles.monthButton}
              accessibilityRole="button"
              accessibilityLabel="Previous month">
              <ChevronLeft size={22} color={theme.colors.text} />
            </TouchableOpacity>
            <Text testID="private-month-label" style={styles.monthLabel}>
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </Text>
            <TouchableOpacity
              testID="private-next-month"
              onPress={() => navigateMonth(1)}
              style={styles.monthButton}
              accessibilityRole="button"
              accessibilityLabel="Next month">
              <ChevronRight size={22} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekdays}>
            {WEEKDAYS.map(day => (
              <Text key={day} style={styles.weekday}>
                {day}
              </Text>
            ))}
          </View>

          {loading ? (
            <View style={styles.calendarLoading}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <View style={styles.daysGrid}>{cells}</View>
          )}
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text testID="private-month-count" style={styles.summaryValue}>
              {summary.monthCount}
            </Text>
            <Text style={styles.summaryLabel}>
              {summary.monthCount === 1 ? 'day logged' : 'days logged'}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text testID="private-last-logged" style={styles.summaryDate}>
              {summary.lastDate ? formatShortDate(summary.lastDate) : 'Never'}
            </Text>
            <Text style={styles.summaryLabel}>Last logged</Text>
          </View>
        </View>

        <View style={styles.settingsCard}>
          <Text style={styles.cardTitle}>Private settings</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingTextWrap}>
              <Text style={styles.settingTitle}>Include in backups</Text>
              <Text style={styles.settingSubtitle}>
                Off by default. When on, new backup files contain this calendar; existing
                files are unchanged.
              </Text>
            </View>
            <Switch
              testID="private-backup-switch"
              value={backupEnabled}
              onValueChange={handleBackupToggle}
              disabled={backupBusy}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={theme.colors.white}
            />
          </View>

          <TouchableOpacity
            testID="private-change-pin"
            style={styles.actionRow}
            onPress={openChangePin}
            accessibilityRole="button">
            <Shield size={20} color={theme.colors.primary} />
            <Text style={styles.actionText}>Change PIN</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="private-clear-data"
            style={styles.actionRow}
            onPress={clearPrivateData}
            accessibilityRole="button">
            <Trash2 size={20} color={theme.colors.error} />
            <Text style={[styles.actionText, styles.dangerText]}>
              Delete all private activity
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footnote}>
          Stored locally on this device. Notes are not encrypted.
        </Text>
      </ScrollView>

      <Modal
        animationType="slide"
        transparent
        visible={modalVisible}
        onRequestClose={closeDay}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View testID="private-day-modal" style={[styles.modalSheet, styles.daySheet]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedDateLabel}</Text>
              <TouchableOpacity
                testID="private-day-close"
                onPress={closeDay}
                style={styles.modalClose}
                accessibilityRole="button"
                accessibilityLabel="Close day">
                <X size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.modalCard}>
                <View style={styles.modalRow}>
                  <View style={styles.settingTextWrap}>
                    <Text style={styles.modalCardTitle}>Activity</Text>
                    <Text style={styles.modalHint}>
                      {activity ? 'Logged for this day' : 'Not logged'}
                    </Text>
                  </View>
                  <Switch
                    testID="private-day-activity"
                    value={activity}
                    onValueChange={setActivity}
                    trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                    thumbColor={theme.colors.white}
                  />
                </View>
              </View>

              {activity ? (
                <>
                  <View style={styles.modalCard}>
                    <Text style={styles.modalCardTitle}>Protection</Text>
                    <View style={styles.chipRow}>
                      {PROTECTION_OPTIONS.map(option => {
                        const selected = protection === option.id;
                        return (
                          <TouchableOpacity
                            key={option.id}
                            testID={`private-protection-${option.id}`}
                            style={[styles.chip, selected && styles.chipSelected]}
                            onPress={() => setProtection(selected ? '' : option.id)}
                            accessibilityRole="button">
                            <Text
                              style={[styles.chipText, selected && styles.chipTextSelected]}>
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.modalCard}>
                    <Text style={styles.modalCardTitle}>Note</Text>
                    <TextInput
                      testID="private-note-input"
                      style={styles.noteInput}
                      value={note}
                      onChangeText={setNote}
                      placeholder="Optional note"
                      placeholderTextColor={theme.colors.textSecondary}
                      multiline
                      maxLength={500}
                      textAlignVertical="top"
                    />
                    <Text style={styles.noteHint}>Stored in plain text on this device.</Text>
                  </View>
                </>
              ) : (
                <Text style={styles.modalHint}>
                  Turn on activity to add protection or a note.
                </Text>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              {existingEntry && (
                <TouchableOpacity
                  testID="private-day-delete"
                  style={styles.deleteButton}
                  onPress={deleteDay}
                  accessibilityRole="button">
                  <Trash2 size={18} color={theme.colors.error} />
                  <Text style={styles.deleteButtonText}>Delete entry</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                testID="private-day-save"
                style={[styles.saveButton, saving && styles.buttonDisabled]}
                onPress={saveDay}
                disabled={saving}
                accessibilityRole="button">
                {saving ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <>
                    <Check size={20} color={theme.colors.white} />
                    <Text style={styles.saveButtonText}>Save</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={changePinVisible}
        onRequestClose={closeChangePin}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            testID="private-change-pin-modal"
            style={[styles.modalSheet, styles.changePinSheet]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change PIN</Text>
              <TouchableOpacity
                testID="private-change-pin-close"
                onPress={closeChangePin}
                style={styles.modalClose}
                accessibilityRole="button"
                accessibilityLabel="Close change PIN">
                <X size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Current PIN</Text>
              <TextInput
                testID="private-change-pin-current"
                style={styles.input}
                value={currentPin}
                onChangeText={value => setCurrentPin(sanitizePin(value))}
                secureTextEntry
                autoComplete="off"
                keyboardType="number-pad"
                maxLength={PIN_MAX_LENGTH}
                editable={!pinBusy}
                placeholder="Current PIN"
                placeholderTextColor={theme.colors.textSecondary}
              />

              <Text style={styles.label}>New PIN</Text>
              <TextInput
                testID="private-change-pin-new"
                style={styles.input}
                value={newPin}
                onChangeText={value => setNewPin(sanitizePin(value))}
                secureTextEntry
                autoComplete="off"
                keyboardType="number-pad"
                maxLength={PIN_MAX_LENGTH}
                editable={!pinBusy}
                placeholder={`${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits`}
                placeholderTextColor={theme.colors.textSecondary}
              />

              <Text style={styles.label}>Confirm new PIN</Text>
              <TextInput
                testID="private-change-pin-confirm"
                style={styles.input}
                value={confirmPin}
                onChangeText={value => setConfirmPin(sanitizePin(value))}
                secureTextEntry
                autoComplete="off"
                keyboardType="number-pad"
                maxLength={PIN_MAX_LENGTH}
                editable={!pinBusy}
                placeholder="Repeat the new PIN"
                placeholderTextColor={theme.colors.textSecondary}
                onSubmitEditing={saveNewPin}
                returnKeyType="done"
              />

              {pinError ? (
                <Text testID="private-change-pin-error" style={styles.errorText}>
                  {pinError}
                </Text>
              ) : null}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                testID="private-change-pin-save"
                style={[styles.saveButton, pinBusy && styles.buttonDisabled]}
                onPress={saveNewPin}
                disabled={pinBusy}
                accessibilityRole="button">
                {pinBusy ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <Text style={styles.saveButtonText}>Update PIN</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <DialogComponent />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 20,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 10,
    },
    headerText: {
      flex: 1,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.colors.text,
    },
    subtitle: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconButton: {
      padding: 8,
      marginLeft: 4,
    },
    calendarCard: {
      backgroundColor: theme.colors.surface,
      marginHorizontal: 16,
      marginTop: 6,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    monthHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    monthButton: {
      padding: 6,
    },
    monthLabel: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.colors.text,
    },
    weekdays: {
      flexDirection: 'row',
      marginBottom: 4,
    },
    weekday: {
      width: '14.2857%',
      textAlign: 'center',
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    daysGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    dayCell: {
      width: '14.2857%',
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 21,
      position: 'relative',
    },
    todayCell: {
      borderWidth: 1.5,
      borderColor: theme.colors.today,
    },
    dayText: {
      fontSize: 15,
      color: theme.colors.text,
    },
    todayText: {
      color: theme.colors.today,
      fontWeight: '700',
    },
    loggedDot: {
      position: 'absolute',
      bottom: 4,
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: theme.colors.primary,
    },
    calendarLoading: {
      height: 180,
      alignItems: 'center',
      justifyContent: 'center',
    },
    summaryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      marginHorizontal: 16,
      marginTop: 12,
      paddingVertical: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    summaryItem: {
      flex: 1,
      alignItems: 'center',
    },
    summaryValue: {
      fontSize: 26,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    summaryDate: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
      marginTop: 3,
    },
    summaryLabel: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    summaryDivider: {
      width: 1,
      height: 36,
      backgroundColor: theme.colors.border,
    },
    settingsCard: {
      backgroundColor: theme.colors.surface,
      marginHorizontal: 16,
      marginTop: 12,
      paddingHorizontal: 16,
      paddingTop: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    cardTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 8,
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
    },
    settingTextWrap: {
      flex: 1,
      marginRight: 12,
    },
    settingTitle: {
      fontSize: 15,
      fontWeight: '500',
      color: theme.colors.text,
    },
    settingSubtitle: {
      fontSize: 12,
      lineHeight: 17,
      color: theme.colors.textSecondary,
      marginTop: 3,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    actionText: {
      fontSize: 15,
      color: theme.colors.text,
      marginLeft: 12,
    },
    dangerText: {
      color: theme.colors.error,
    },
    footnote: {
      fontSize: 12,
      lineHeight: 18,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginHorizontal: 24,
      marginTop: 16,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 20,
      width: '100%',
    },
    daySheet: {
      height: '80%',
    },
    changePinSheet: {
      height: '58%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
      flex: 1,
    },
    modalClose: {
      padding: 5,
    },
    modalScroll: {
      flex: 1,
    },
    modalCard: {
      backgroundColor: theme.colors.surface,
      marginHorizontal: 20,
      marginVertical: 8,
      padding: 18,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    modalCardTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 8,
    },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    modalHint: {
      fontSize: 13,
      lineHeight: 19,
      color: theme.colors.textSecondary,
      marginHorizontal: 20,
      marginTop: 8,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 20,
      backgroundColor: theme.colors.secondary,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    chipSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    chipText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    chipTextSelected: {
      color: theme.colors.white,
      fontWeight: '600',
    },
    noteInput: {
      minHeight: 100,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      padding: 12,
      fontSize: 15,
      lineHeight: 21,
      color: theme.colors.text,
    },
    noteHint: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 6,
    },
    modalFooter: {
      paddingHorizontal: 20,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    deleteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      marginBottom: 6,
    },
    deleteButtonText: {
      fontSize: 14,
      color: theme.colors.error,
      marginLeft: 6,
    },
    saveButton: {
      backgroundColor: theme.colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      borderRadius: 12,
      gap: 8,
    },
    saveButtonText: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.colors.white,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      marginHorizontal: 20,
      marginTop: 14,
      marginBottom: 6,
    },
    input: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.colors.text,
      marginHorizontal: 20,
      letterSpacing: 3,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: 13,
      lineHeight: 19,
      marginHorizontal: 20,
      marginTop: 10,
    },
  });
