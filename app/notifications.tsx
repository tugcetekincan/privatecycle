import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  AlertTriangle,
  Bell,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  MessageCircle,
  Moon,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
} from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useDialog } from '@/hooks/useDialog';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import {
  previewNotificationCopy,
  PRIVACY_DESCRIPTIONS,
  PRIVACY_LABELS,
  TONE_DESCRIPTIONS,
  TONE_LABELS,
} from '@/services/NotificationCopy';
import {
  NotificationService,
  type NotificationPermissionState,
} from '@/services/NotificationService';
import type {
  LoggingCadence,
  NotificationSettings,
  PeriodLeadDays,
} from '@/services/NotificationSettings';
import { Card } from '@/components/ui/Card';
import IconTile from '@/components/ui/IconTile';
import PrimaryButton from '@/components/ui/PrimaryButton';
import ScreenFade from '@/components/ui/ScreenFade';
import SectionHeader from '@/components/ui/SectionHeader';
import SettingsRow from '@/components/ui/SettingsRow';
import { radii, spacing, typography } from '@/design/tokens';

const isWeb = Platform.OS === 'web';

const REMINDER_KEYS = [
  'periodReminder',
  'lateCheckIn',
  'fertileWindow',
  'phaseTips',
  'loggingReminder',
  'backupReminder',
  'weeklySummary',
] as const;

const leadLabel = (days: PeriodLeadDays): string =>
  `${days} day${days === 1 ? '' : 's'} before`;

const cadenceLabel = (cadence: LoggingCadence): string =>
  cadence === 'daily' ? 'Every day' : 'Every Sunday';

/**
 * Native notifications settings and first-run setup. Kept outside the tabs,
 * reached from Settings, so the main settings screen stays scannable.
 */
export default function NotificationsScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { settings, loading, refresh, update } = useNotificationSettings();
  const { showSuccess, showError, showInfo, showDialog, showChoice, DialogComponent } =
    useDialog();

  const [permission, setPermission] =
    useState<NotificationPermissionState>('undetermined');
  const [busy, setBusy] = useState(false);

  const styles = createStyles(theme);

  const refreshPermission = useCallback(async () => {
    setPermission(await NotificationService.getPermissionState());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void refreshPermission();
    }, [refresh, refreshPermission])
  );

  useEffect(() => {
    if (isWeb) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshPermission();
        if (settings.enabled) void NotificationService.syncSchedule(settings);
      }
    });
    return () => subscription.remove();
  }, [refreshPermission, settings]);

  const apply = useCallback(
    async (patch: Partial<NotificationSettings>): Promise<NotificationSettings> => {
      try {
        const next = await update(patch);
        void NotificationService.syncSchedule(next);
        return next;
      } catch (error) {
        console.error('Error saving notification settings:', error);
        showError('Could not save', 'Your notification settings were not changed.');
        return settings;
      }
    },
    [settings, showError, update]
  );

  const closeRoute = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings');
    }
  }, [router]);

  const showPermissionHelp = useCallback(() => {
    showDialog({
      title: 'Notifications are blocked',
      message:
        'Allow notifications for PrivateCycle in your system settings, then come back and turn them on.',
      type: 'warning',
      buttons: [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Open settings',
          style: 'primary',
          onPress: () => {
            void NotificationService.openSystemSettings();
          },
        },
      ],
    });
  }, [showDialog]);

  const handleMasterToggle = useCallback(
    async (value: boolean) => {
      if (!value) {
        try {
          await apply({ enabled: false });
        } catch (error) {
          console.error('Error pausing notifications:', error);
          showError('Could not save', 'Your notification settings were not changed.');
        }
        return;
      }

      setBusy(true);
      try {
        const granted =
          permission === 'granted' || (await NotificationService.requestPermission());
        await refreshPermission();

        if (!granted) {
          await apply({ configured: true, enabled: false });
          showPermissionHelp();
          return;
        }

        await apply({ configured: true, enabled: true });
      } catch (error) {
        console.error('Error updating notifications:', error);
        showError('Could not save', 'Your notification settings were not changed.');
      } finally {
        setBusy(false);
      }
    },
    [apply, permission, refreshPermission, showError, showPermissionHelp]
  );

  const handleEnable = useCallback(async () => {
    setBusy(true);
    try {
      const granted = await NotificationService.requestPermission();
      await refreshPermission();

      if (!granted) {
        await apply({ configured: true, enabled: false });
        showPermissionHelp();
        return;
      }

      const next = await apply({ configured: true, enabled: true });
      if (next.enabled) {
        showSuccess(
          'Notifications on',
          'Your reminders will arrive on this device. You can adjust them below.'
        );
      }
    } catch (error) {
      console.error('Error enabling notifications:', error);
      showError('Could not save', 'Your notification settings were not changed.');
    } finally {
      setBusy(false);
    }
  }, [apply, refreshPermission, showError, showPermissionHelp, showSuccess]);

  const handleTest = useCallback(async () => {
    if (!settings.enabled) {
      showInfo('Notifications are off', 'Turn the master switch on first.');
      return;
    }
    const sent = await NotificationService.sendTestNotification(settings);
    if (sent) {
      showSuccess('Test scheduled', 'It should arrive in about 5 seconds.');
    } else {
      showError(
        'Could not schedule',
        'Check that notifications are allowed for PrivateCycle in system settings.'
      );
    }
  }, [settings, showError, showInfo, showSuccess]);

  const choosePrivacy = useCallback(() => {
    showChoice(
      'Lock-screen detail',
      'Discreet keeps the wording neutral. Detailed shows period and fertility words in the notification, which can be visible on your lock screen.',
      [
        {
          text: 'Discreet — neutral text',
          onPress: () => void apply({ privacy: 'discreet' }),
        },
        {
          text: 'Detailed — show cycle words',
          onPress: () => void apply({ privacy: 'detailed' }),
        },
      ],
      true
    );
  }, [apply, showChoice]);

  const chooseTone = useCallback(() => {
    showChoice(
      'Voice',
      'The voice affects detailed notification copy and the preview below.',
      [
        {
          text: 'Friendly — warm and plain',
          onPress: () => void apply({ tone: 'friendly' }),
        },
        {
          text: 'Girly — soft and playful',
          onPress: () => void apply({ tone: 'girly' }),
        },
        {
          text: 'Formal — neutral and short',
          onPress: () => void apply({ tone: 'formal' }),
        },
      ],
      true
    );
  }, [apply, showChoice]);

  const chooseLeadDays = useCallback(() => {
    showChoice(
      'Period lead time',
      'How early should the predicted-period reminder arrive?',
      ([1, 2, 3, 5] as PeriodLeadDays[]).map((days) => ({
        text: leadLabel(days),
        onPress: () => void apply({ periodLeadDays: days }),
      })),
      true
    );
  }, [apply, showChoice]);

  const chooseCadence = useCallback(() => {
    showChoice(
      'Logging cadence',
      'Daily is a gentle nudge each evening. Weekly is one check-in on Sunday.',
      [
        {
          text: 'Daily',
          onPress: () => void apply({ loggingCadence: 'daily' }),
        },
        {
          text: 'Weekly on Sunday',
          onPress: () => void apply({ loggingCadence: 'weekly' }),
        },
      ],
      true
    );
  }, [apply, showChoice]);

  const chooseLoggingTime = useCallback(() => {
    showChoice(
      'Logging time',
      "Pick a time that usually works for you. Times use your phone's local time zone.",
      ['08:00', '12:00', '18:00', '20:00', '22:00'].map((time) => ({
        text: time,
        onPress: () => void apply({ loggingTime: time }),
      })),
      true
    );
  }, [apply, showChoice]);

  const reminderSwitch = (
    value: boolean,
    onChange: (value: boolean) => void,
    testID: string,
    label: string
  ) => (
    <Switch
      testID={testID}
      accessibilityLabel={label}
      value={value}
      onValueChange={onChange}
      disabled={busy}
      trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
      thumbColor={theme.colors.white}
    />
  );

  const activeCount = REMINDER_KEYS.filter((key) => settings[key]).length;
  const preview = previewNotificationCopy(settings);

  const renderStyleCard = () => (
    <Card style={styles.sectionCard} padding={14}>
      <SettingsRow
        testID="notifications-privacy"
        icon={<Shield size={15} color={theme.colors.teal} />}
        tone="teal"
        title="Lock-screen detail"
        subtitle={`${PRIVACY_LABELS[settings.privacy]} · ${PRIVACY_DESCRIPTIONS[settings.privacy]}`}
        onPress={choosePrivacy}
        right={<ChevronRight size={16} color={theme.colors.textSecondary} />}
      />
      <SettingsRow
        last
        testID="notifications-tone"
        icon={<MessageCircle size={15} color={theme.colors.primary} />}
        tone="primary"
        title="Voice"
        subtitle={`${TONE_LABELS[settings.tone]} · ${TONE_DESCRIPTIONS[settings.tone]}`}
        onPress={chooseTone}
        right={<ChevronRight size={16} color={theme.colors.textSecondary} />}
      />
    </Card>
  );

  const renderPreview = () => (
    <Card style={styles.previewCard} padding={14} testID="notifications-preview">
      <View style={styles.previewHeader}>
        <IconTile size={26} tone="primary">
          <Bell size={13} color={theme.colors.primary} />
        </IconTile>
        <Text style={styles.previewApp}>PRIVATECYCLE</Text>
        <Text style={styles.previewNow}>now</Text>
      </View>
      <Text testID="notifications-preview-title" style={styles.previewTitle}>
        {preview.title}
      </Text>
      <Text testID="notifications-preview-body" style={styles.previewBody}>
        {preview.body}
      </Text>
    </Card>
  );

  const renderCycleReminders = () => (
    <Card style={styles.sectionCard} padding={14}>
      <SettingsRow
        testID="notifications-period"
        icon={<Calendar size={15} color={theme.colors.primary} />}
        tone="primary"
        title="Period reminder"
        subtitle={`${leadLabel(settings.periodLeadDays)} · 09:00`}
        right={reminderSwitch(
          settings.periodReminder,
          (value) => void apply({ periodReminder: value }),
          'notifications-period-switch',
          'Period reminder'
        )}
      />
      {settings.periodReminder && (
        <SettingsRow
          testID="notifications-period-lead"
          icon={<Clock size={15} color={theme.colors.textSecondary} />}
          title="Lead time"
          subtitle={leadLabel(settings.periodLeadDays)}
          onPress={chooseLeadDays}
          right={<ChevronRight size={16} color={theme.colors.textSecondary} />}
        />
      )}
      <SettingsRow
        testID="notifications-late"
        icon={<Clock size={15} color={theme.colors.warning} />}
        tone="warning"
        title="Late-period check-in"
        subtitle="2 days after a missed prediction · 09:00"
        right={reminderSwitch(
          settings.lateCheckIn,
          (value) => void apply({ lateCheckIn: value }),
          'notifications-late-switch',
          'Late-period check-in'
        )}
      />
      <SettingsRow
        testID="notifications-fertile"
        icon={<Sparkles size={15} color={theme.colors.teal} />}
        tone="teal"
        title="Fertile-window alert"
        subtitle="Day before the estimated window · 09:00"
        right={reminderSwitch(
          settings.fertileWindow,
          (value) => void apply({ fertileWindow: value }),
          'notifications-fertile-switch',
          'Fertile-window alert'
        )}
      />
      <SettingsRow
        last
        testID="notifications-phase"
        icon={<Moon size={15} color={theme.colors.success} />}
        tone="success"
        title="Phase-change tips"
        subtitle="First day of each phase · 08:00"
        right={reminderSwitch(
          settings.phaseTips,
          (value) => void apply({ phaseTips: value }),
          'notifications-phase-switch',
          'Phase-change tips'
        )}
      />
    </Card>
  );

  const renderRoutineReminders = () => (
    <Card style={styles.sectionCard} padding={14}>
      <SettingsRow
        testID="notifications-logging"
        icon={<RefreshCw size={15} color={theme.colors.primary} />}
        tone="primary"
        title="Logging reminder"
        subtitle={`${cadenceLabel(settings.loggingCadence)} at ${settings.loggingTime}`}
        right={reminderSwitch(
          settings.loggingReminder,
          (value) => void apply({ loggingReminder: value }),
          'notifications-logging-switch',
          'Logging reminder'
        )}
      />
      {settings.loggingReminder && (
        <>
          <SettingsRow
            testID="notifications-logging-cadence"
            icon={<Clock size={15} color={theme.colors.textSecondary} />}
            title="Cadence"
            subtitle={cadenceLabel(settings.loggingCadence)}
            onPress={chooseCadence}
            right={<ChevronRight size={16} color={theme.colors.textSecondary} />}
          />
          <SettingsRow
            testID="notifications-logging-time"
            icon={<Clock size={15} color={theme.colors.textSecondary} />}
            title="Time"
            subtitle={`${settings.loggingTime} (device time)`}
            onPress={chooseLoggingTime}
            right={<ChevronRight size={16} color={theme.colors.textSecondary} />}
          />
        </>
      )}
      <SettingsRow
        testID="notifications-backup"
        icon={<Shield size={15} color={theme.colors.success} />}
        tone="success"
        title="Backup reminder"
        subtitle="Monthly if no recent backup · 10:00"
        right={reminderSwitch(
          settings.backupReminder,
          (value) => void apply({ backupReminder: value }),
          'notifications-backup-switch',
          'Backup reminder'
        )}
      />
      <SettingsRow
        last
        testID="notifications-weekly"
        icon={<Sparkles size={15} color={theme.colors.teal} />}
        tone="teal"
        title="Weekly summary"
        subtitle="Sunday at 18:00"
        right={reminderSwitch(
          settings.weeklySummary,
          (value) => void apply({ weeklySummary: value }),
          'notifications-weekly-switch',
          'Weekly summary'
        )}
      />
    </Card>
  );

  const renderCycleNote = () => (
    <Text style={[typography.caption, styles.sectionNote, { color: theme.colors.textSecondary }]}>
      Cycle reminders begin after you log a period; routines work right away.
    </Text>
  );

  const renderPrivacyNote = () => (
    <Card style={styles.privacyNote} padding={14}>
      <IconTile size={30} tone="success">
        <Shield size={15} color={theme.colors.success} />
      </IconTile>
      <View style={styles.privacyCopy}>
        <Text style={[typography.rowTitle, { color: theme.colors.successText }]}>
          Private by design
        </Text>
        <Text style={[typography.caption, styles.privacyText, { color: theme.colors.textSecondary }]}>
          Predictions are wellness estimates, not medical advice or contraception. Private
          calendar entries are never included in notifications.
        </Text>
      </View>
    </Card>
  );

  const renderPermissionWarning = () => (
    <Card
      testID="notifications-permission-warning"
      style={[styles.sectionCard, styles.warningCard]}
      padding={14}>
      <View style={styles.noticeRow}>
        <IconTile size={30} tone="warning">
          <AlertTriangle size={15} color={theme.colors.warning} />
        </IconTile>
        <View style={styles.noticeCopy}>
          <Text style={[typography.rowTitle, { color: theme.colors.text }]}>
            Notifications are blocked
          </Text>
          <Text style={[typography.caption, styles.noticeText, { color: theme.colors.textSecondary }]}>
            Allow them in system settings, then return here and turn the master switch on.
          </Text>
          <TouchableOpacity
            testID="notifications-open-settings"
            style={{ minHeight: 44, justifyContent: 'center' }}
            onPress={() => void NotificationService.openSystemSettings()}
            accessibilityRole="button">
            <Text style={[typography.caption, styles.noticeLink, { color: theme.colors.warning }]}>
              Open system settings
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Card>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScreenFade>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              testID="notifications-back"
              onPress={closeRoute}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Back">
              <ChevronLeft size={22} color={theme.colors.text} />
            </TouchableOpacity>
            <View style={styles.headerCopy}>
              <Text style={[typography.pageTitle, { color: theme.colors.text }]}>
                Notifications
              </Text>
              <Text
                style={[
                  typography.pageSubtitle,
                  styles.headerSubtitle,
                  { color: theme.colors.textSecondary },
                ]}>
                Reminders, privacy and tone
              </Text>
            </View>
            <View style={[styles.headerIcon, { backgroundColor: theme.colors.primarySoft }]}>
              <Bell size={21} color={theme.colors.primary} />
            </View>
          </View>

          {isWeb ? (
            <>
              <Card
                testID="notifications-web-notice"
                style={styles.sectionCard}
                padding={16}
                tone="tint">
                <View style={styles.noticeRow}>
                  <IconTile size={30} tone="warning">
                    <Info size={15} color={theme.colors.warning} />
                  </IconTile>
                  <View style={styles.noticeCopy}>
                    <Text style={[typography.rowTitle, { color: theme.colors.text }]}>
                      Available in the mobile app
                    </Text>
                    <Text
                      style={[
                        typography.caption,
                        styles.noticeText,
                        { color: theme.colors.textSecondary },
                      ]}>
                      {NotificationService.webUnsupportedMessage} This web preview cannot
                      schedule reminders, but you can review the style below.
                    </Text>
                  </View>
                </View>
              </Card>
              <SectionHeader title="STYLE PREVIEW" dotColor={theme.colors.primary} />
              {renderPreview()}
              {renderPrivacyNote()}
            </>
          ) : loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : !settings.configured ? (
            <>
              <Card style={styles.sectionCard} padding={16} tone="tint">
                <Text style={[typography.cardTitle, { color: theme.colors.text }]}>
                  Reminders that stay on your phone
                </Text>
                <Text
                  style={[
                    typography.caption,
                    styles.introText,
                    { color: theme.colors.textSecondary },
                  ]}>
                  Choose how much detail appears on the lock screen and which nudges you want.
                  Everything is scheduled locally; nothing is sent anywhere.
                </Text>
              </Card>

              <SectionHeader title="STYLE" dotColor={theme.colors.teal} />
              {renderStyleCard()}

              <SectionHeader title="PREVIEW" dotColor={theme.colors.primary} />
              {renderPreview()}

              <SectionHeader title="CYCLE REMINDERS" dotColor={theme.colors.primary} />
              {renderCycleReminders()}
              {renderCycleNote()}

              <SectionHeader title="ROUTINES" dotColor={theme.colors.success} />
              {renderRoutineReminders()}

              <PrimaryButton
                testID="notifications-enable"
                title={busy ? 'Enabling…' : 'Enable notifications'}
                onPress={handleEnable}
                disabled={busy}
                style={styles.enableButton}
              />
              {renderPrivacyNote()}
            </>
          ) : (
            <>
              <Card style={styles.sectionCard} padding={14}>
                <SettingsRow
                  last
                  testID="notifications-master"
                  icon={<Bell size={15} color={theme.colors.primary} />}
                  tone="primary"
                  title="Notifications"
                  subtitle={
                    settings.enabled
                      ? `${activeCount} reminder${activeCount === 1 ? '' : 's'} on`
                      : 'Off'
                  }
                  right={reminderSwitch(
                    settings.enabled,
                    (value) => void handleMasterToggle(value),
                    'notifications-master-switch',
                    'Notifications'
                  )}
                />
              </Card>

              {!settings.enabled && (
                <Text style={[typography.caption, styles.masterHint, { color: theme.colors.textSecondary }]}>
                  Reminders are paused. Your choices are saved.
                </Text>
              )}

              {permission === 'denied' && renderPermissionWarning()}

              <SectionHeader title="STYLE" dotColor={theme.colors.teal} />
              {renderStyleCard()}

              <SectionHeader title="PREVIEW" dotColor={theme.colors.primary} />
              {renderPreview()}

              <SectionHeader title="CYCLE REMINDERS" dotColor={theme.colors.primary} />
              {renderCycleReminders()}
              {renderCycleNote()}

              <SectionHeader title="ROUTINES" dotColor={theme.colors.success} />
              {renderRoutineReminders()}

              <SectionHeader title="TEST" dotColor={theme.colors.warning} />
              <Card style={styles.sectionCard} padding={14}>
                <SettingsRow
                  last
                  testID="notifications-test"
                  icon={<Send size={15} color={theme.colors.warning} />}
                  tone="warning"
                  title="Send test notification"
                  subtitle={
                    settings.enabled
                      ? 'Arrives in about 5 seconds'
                      : 'Turn notifications on first'
                  }
                  onPress={() => void handleTest()}
                  right={<ChevronRight size={16} color={theme.colors.textSecondary} />}
                />
              </Card>

              {renderPrivacyNote()}
            </>
          )}
        </ScrollView>
      </ScreenFade>
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
    content: {
      paddingBottom: spacing.xxxl,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.xxl,
      paddingBottom: spacing.lg,
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -spacing.xs,
      backgroundColor: theme.colors.secondary,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
    },
    headerSubtitle: {
      marginTop: 2,
    },
    headerIcon: {
      width: 38,
      height: 38,
      borderRadius: radii.button,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionCard: {
      marginHorizontal: spacing.xxl,
      marginTop: 0,
    },
    sectionNote: {
      marginHorizontal: spacing.xxl,
      marginTop: spacing.xs,
      lineHeight: 15,
    },
    introText: {
      marginTop: spacing.xs,
      lineHeight: 17,
    },
    previewCard: {
      marginHorizontal: spacing.xxl,
      marginTop: 0,
    },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    previewApp: {
      ...typography.caption,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: theme.colors.textSecondary,
      flex: 1,
    },
    previewNow: {
      ...typography.caption,
      fontSize: 10,
      color: theme.colors.textSecondary,
    },
    previewTitle: {
      ...typography.rowTitle,
      marginTop: spacing.sm,
      color: theme.colors.text,
    },
    previewBody: {
      ...typography.caption,
      marginTop: 2,
      lineHeight: 16,
      color: theme.colors.textSecondary,
    },
    masterHint: {
      marginHorizontal: spacing.xxl,
      marginTop: spacing.xs,
    },
    warningCard: {
      backgroundColor: theme.colors.warningSoft,
      borderColor: theme.colors.warningSoft,
    },
    noticeRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    noticeCopy: {
      flex: 1,
      minWidth: 0,
    },
    noticeText: {
      marginTop: 2,
      lineHeight: 16,
    },
    noticeLink: {
      marginTop: spacing.xs,
      fontWeight: '700',
    },
    enableButton: {
      marginHorizontal: spacing.xxl,
      marginTop: spacing.xxl,
    },
    privacyNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      marginHorizontal: spacing.xxl,
      marginTop: spacing.xxl,
      backgroundColor: theme.colors.successSoft,
      borderColor: theme.colors.successSoft,
    },
    privacyCopy: {
      flex: 1,
    },
    privacyText: {
      marginTop: 2,
      lineHeight: 16,
    },
    loading: {
      paddingTop: spacing.huge,
      alignItems: 'center',
    },
  });
