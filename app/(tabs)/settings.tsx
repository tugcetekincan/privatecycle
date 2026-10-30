import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Switch,
  ActivityIndicator,
  Platform,
} from 'react-native';

import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
const isWeb = Platform.OS === 'web';
import { 
  Settings as SettingsIcon, 
  Bell, 
  Moon, 
  Shield, 
  CircleHelp as HelpCircle, 
  Trash2,
  Download,
  Upload,
  HardDrive,
  Clock,
  RefreshCw,
  Info,
  Database,
  ChevronRight,
} from 'lucide-react-native';
import { DataService } from '@/services/DataService';
import { BackupService, BackupSettings } from '@/services/BackupService';
import { NotificationService } from '@/services/NotificationService';
import { PrivateAccessService } from '@/services/PrivateAccessService';
import { seedDemoData, resetDemoData } from '@/services/DevSeedService';
import { useTheme } from '@/hooks/useTheme';
import { useAutoBackup } from '@/hooks/useAutoBackup';
import { useDialog } from '@/hooks/useDialog';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import ScreenHeader from '@/components/ui/ScreenHeader';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card } from '@/components/ui/Card';
import IconTile from '@/components/ui/IconTile';
import SettingsRow from '@/components/ui/SettingsRow';
import ScreenFade from '@/components/ui/ScreenFade';
import { radii, spacing, typography } from '@/design/tokens';

export default function SettingsTab() {
  const { theme, toggleTheme, isDark } = useTheme();
  const router = useRouter();
  const { triggerAutoBackup } = useAutoBackup();
  const {
    settings: notificationSettings,
    loading: notificationSettingsLoading,
    refresh: refreshNotifications,
  } = useNotificationSettings();
  const { 
    showSuccess, 
    showError, 
    showInfo, 
    showConfirm, 
    showChoice, 
    DialogComponent 
  } = useDialog();
  const [privateMode, setPrivateMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [backupSettings, setBackupSettings] = useState<BackupSettings>({
    autoBackupEnabled: false,
    autoBackupFrequency: 'weekly',
    keepLocalBackups: 5,
    lastBackupTime: null,
  });
  const [backupStats, setBackupStats] = useState({
    totalBackups: 0,
    totalSize: 0,
    lastBackup: null as Date | null,
    nextAutoBackup: null as Date | null,
  });

  useEffect(() => {
    loadBackupData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshNotifications();
    }, [refreshNotifications])
  );

  const activeNotificationCount = [
    notificationSettings.periodReminder,
    notificationSettings.lateCheckIn,
    notificationSettings.fertileWindow,
    notificationSettings.phaseTips,
    notificationSettings.loggingReminder,
    notificationSettings.backupReminder,
    notificationSettings.weeklySummary,
  ].filter(Boolean).length;

  const notificationSummary = notificationSettingsLoading
    ? 'Loading…'
    : isWeb
      ? 'Available in the Android and iOS app'
      : !notificationSettings.configured
        ? 'Set up reminders, privacy and tone'
        : notificationSettings.enabled
          ? `${activeNotificationCount} reminder${
              activeNotificationCount === 1 ? '' : 's'
            } on`
          : 'Off';

  const loadBackupData = async () => {
    try {
      const settings = await BackupService.getBackupSettings();
      const stats = await BackupService.getBackupStats();
      setBackupSettings(settings);
      setBackupStats(stats);
    } catch (error) {
      console.error('Error loading backup data:', error);
    }
  };

  const updateBackupSettings = async (newSettings: Partial<BackupSettings>) => {
    try {
      const updatedSettings = { ...backupSettings, ...newSettings };
      await BackupService.saveBackupSettings(updatedSettings);
      setBackupSettings(updatedSettings);
      await loadBackupData();
    } catch (error) {
      console.error('Error updating backup settings:', error);
      showError('Error', 'Failed to update backup settings');
    }
  };

  const createManualBackup = async () => {
    setLoading(true);
    try {
      const filePath = await BackupService.exportBackup({ saveToDevice: true, shareFile: false });
      await loadBackupData();
      void NotificationService.syncSchedule();
      showSuccess('Success', 'Backup created and saved successfully!');
    } catch (error) {
      console.error('Error creating backup:', error);
      showError('Error', 'Failed to create backup');
    } finally {
      setLoading(false);
    }
  };

  const exportBackup = async () => {
    setLoading(true);
    try {
      await BackupService.exportBackup({ shareFile: true });
      void NotificationService.syncSchedule();
    } catch (error) {
      console.error('Error exporting backup:', error);
      showError('Error', 'Failed to export backup');
    } finally {
      setLoading(false);
    }
  };

  const importBackup = async () => {
    showConfirm(
      'Import Backup',
      'This will replace your cycle data with the backup data. Private calendar entries are only replaced if the backup includes them. Are you sure you want to continue?',
      async () => {
        setLoading(true);
        try {
          const result = await BackupService.importBackup();
          if (result.success) {
            await loadBackupData();
            void NotificationService.syncSchedule();
            showSuccess(
              'Import Successful',
              result.message + (result.stats ? `\n\nBackup Details:\n• Version: ${result.stats.version}\n• Date: ${result.stats.timestamp}\n• Days: ${result.stats.totalDays}\n• Private activity: ${result.stats.includesPrivateData ? 'included' : 'not included'}` : '')
            );
          } else {
            showError('Import Failed', result.message);
          }
        } catch (error) {
          console.error('Error importing backup:', error);
          showError('Error', 'Failed to import backup');
        } finally {
          setLoading(false);
        }
      },
      undefined,
      'Import',
      'Cancel',
      true
    );
  };

  const deleteBackup = async () => {
    try {
      const backups = await BackupService.getLocalBackups();
      if (backups.length === 0) {
        showInfo('No Backup', 'No local backup found to delete.');
        return;
      }

      const backup = backups[0];
      showConfirm(
        'Delete Backup',
        `Are you sure you want to delete the local backup?\n\nFile: ${backup.name}\nSize: ${BackupService.formatFileSize(backup.size)}\nDate: ${backup.date.toLocaleDateString()}`,
        async () => {
          try {
            await BackupService.deleteBackup(backup.path);
            await loadBackupData();
            showSuccess('Success', 'Backup deleted successfully.');
          } catch (error) {
            showError('Error', 'Failed to delete backup');
          }
        },
        undefined,
        'Delete',
        'Cancel',
        true
      );
    } catch (error) {
      console.error('Error deleting backup:', error);
      showError('Error', 'Failed to delete backup');
    }
  };

  const clearAllData = () => {
    showChoice(
      'Clear All Data',
      'Are you sure you want to delete all your tracking data, private calendar entries, and all backups? This action cannot be undone.\n\nPrivate entries are included in an exported backup only if you enabled "Include in backups" inside the private calendar.\n\nConsider exporting a backup first!',
      [
        {
          text: 'Export Backup First',
          onPress: exportBackup
        },
        { 
          text: 'Delete Everything',
          onPress: async () => {
            try {
              await BackupService.clearAllData();
              await PrivateAccessService.reset();
              await loadBackupData();
              void NotificationService.syncSchedule();
              showSuccess('Success', 'All data, private activity, and backups have been cleared.');
            } catch (error) {
              showError('Error', 'Failed to clear all data');
            }
          }
        },
      ],
      true
    );
  };

  const showAbout = () => {
    const version = Constants.expoConfig?.version ?? 'unknown';
    showInfo(
      'About Period Tracker',
      `A simple and private period tracking app to help you monitor your menstrual cycle, symptoms, and overall health patterns.\n\nVersion ${version}`
    );
  };

  const showHelp = () => {
    showInfo(
      'Help',
      '• Use the Calendar tab to log period, symptoms, and mood\n• View cycle, symptom and mood trends in Overview\n• Read personalized patterns and phase tips in Insights\n• All data is stored locally on your device'
    );
  };

  // --- Developer helpers (__DEV__ only) ---

  const performLoadDemoData = async () => {
    try {
      const result = await seedDemoData({ force: true });
      await loadBackupData();
      void NotificationService.syncSchedule();
      showSuccess('Demo Data Loaded', `${result.days} days of sample data were generated.`);
    } catch (error) {
      console.error('Error loading demo data:', error);
      showError('Error', 'Failed to load demo data');
    }
  };

  const loadDemoData = () => {
    showConfirm(
      'Load Demo Data',
      'This replaces all current tracking data, including private calendar entries. Continue?',
      performLoadDemoData,
      undefined,
      'Load',
      'Cancel',
      true
    );
  };

  const confirmResetDemoData = () => {
    showConfirm(
      'Reset Demo Data',
      'This deletes all tracking data and private calendar entries (backups and the private PIN are kept). Continue?',
      async () => {
        try {
          await resetDemoData();
          await loadBackupData();
          void NotificationService.syncSchedule();
          showSuccess('Data Reset', 'All tracking data and private activity have been deleted.');
        } catch (error) {
          console.error('Error resetting demo data:', error);
          showError('Error', 'Failed to reset data');
        }
      },
      undefined,
      'Reset',
      'Cancel',
      true
    );
  };

  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.container}>
      <ScreenFade>
        <ScrollView style={styles.scrollView}>
          <ScreenHeader
            title="Settings"
            subtitle="Preferences, privacy and backups"
            icon={<SettingsIcon size={21} color={theme.colors.primary} />}
          />

          <SectionHeader title="APP SETTINGS" dotColor={theme.colors.primary} />
          <Card style={styles.sectionCard} padding={14}>
            <SettingsRow
              testID="settings-notifications"
              icon={<Bell size={15} color={theme.colors.primary} />}
              tone="primary"
              title="Notifications"
              subtitle={notificationSummary}
              onPress={() => router.push('/notifications')}
              right={<ChevronRight size={16} color={theme.colors.textSecondary} />}
            />
            <SettingsRow
              last
              icon={<Moon size={15} color={theme.colors.textSecondary} />}
              title="Dark mode"
              subtitle="Switch to the dark theme"
              right={
                <Switch
                  testID="settings-darkmode-switch"
                  value={isDark}
                  onValueChange={toggleTheme}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  thumbColor={theme.colors.white}
                />
              }
            />
          </Card>

          <SectionHeader title="CYCLE SETTINGS" dotColor={theme.colors.warning} />
          <Card style={styles.sectionCard} padding={16}>
            <Text style={[typography.cardTitle, styles.cardTitle, { color: theme.colors.text }]}>
              Cycle information
            </Text>
            <Text style={[typography.caption, styles.cardSubtitle, { color: theme.colors.textSecondary }]}>
              Your current defaults
            </Text>
            <View style={styles.cycleInfo}>
              <View style={styles.cycleInfoItem}>
                <Text style={[typography.caption, styles.cycleInfoLabel, { color: theme.colors.textSecondary }]}>
                  Average cycle length
                </Text>
                <Text style={[typography.rowTitle, { color: theme.colors.primary }]}>28 days</Text>
              </View>
              <View style={styles.cycleInfoItem}>
                <Text style={[typography.caption, styles.cycleInfoLabel, { color: theme.colors.textSecondary }]}>
                  Period length
                </Text>
                <Text style={[typography.rowTitle, { color: theme.colors.primary }]}>5 days</Text>
              </View>
              <View style={styles.cycleInfoItem}>
                <Text style={[typography.caption, styles.cycleInfoLabel, { color: theme.colors.textSecondary }]}>
                  Luteal phase
                </Text>
                <Text style={[typography.rowTitle, { color: theme.colors.primary }]}>14 days</Text>
              </View>
            </View>
          </Card>

          <SectionHeader title="PRIVACY" dotColor={theme.colors.teal} />
          <Card style={styles.sectionCard} padding={14}>
            <SettingsRow
              last
              testID="settings-private-calendar"
              icon={<Shield size={15} color={theme.colors.teal} />}
              tone="teal"
              title="Private calendar"
              subtitle="PIN-protected personal log"
              onPress={() => router.push('/private')}
              right={<ChevronRight size={16} color={theme.colors.textSecondary} />}
            />
          </Card>

          <SectionHeader title="SUPPORT" dotColor={theme.colors.success} />
          <Card style={styles.sectionCard} padding={14}>
            <SettingsRow
              testID="settings-help"
              icon={<HelpCircle size={15} color={theme.colors.success} />}
              tone="success"
              title="Help & FAQ"
              onPress={showHelp}
              right={<ChevronRight size={16} color={theme.colors.textSecondary} />}
            />
            <SettingsRow
              last
              testID="settings-about"
              icon={<SettingsIcon size={15} color={theme.colors.textSecondary} />}
              title="About"
              onPress={showAbout}
              right={<ChevronRight size={16} color={theme.colors.textSecondary} />}
            />
          </Card>

          <SectionHeader title="BACKUP & RESTORE" meta="Local only" dotColor={theme.colors.primary} />
          <Card style={styles.sectionCard} padding={14}>
            {isWeb && (
              <View
                style={[
                  styles.webNotice,
                  { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primarySoft },
                ]}>
                <Info size={13} color={theme.colors.primary} />
                <Text style={[typography.caption, styles.webNoticeText, { color: theme.colors.textSecondary }]}>
                  On the web, exporting downloads a backup file and importing reads one from your device.
                </Text>
              </View>
            )}

            {!isWeb && (
              <SettingsRow
                icon={<RefreshCw size={15} color={theme.colors.textSecondary} />}
                title="Auto backup"
                subtitle="Automatically create backups"
                right={
                  <Switch
                    testID="settings-auto-backup-switch"
                    value={backupSettings.autoBackupEnabled}
                    onValueChange={(value) => updateBackupSettings({ autoBackupEnabled: value })}
                    trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                    thumbColor={theme.colors.white}
                  />
                }
              />
            )}

            {!isWeb && backupSettings.autoBackupEnabled && (
              <SettingsRow
                icon={<Clock size={15} color={theme.colors.textSecondary} />}
                title="Backup frequency"
                subtitle={`Currently: ${backupSettings.autoBackupFrequency}`}
                onPress={() => {
                  showChoice(
                    'Backup Frequency',
                    'Choose how often to create automatic backups',
                    [
                      {
                        text: 'Daily',
                        onPress: () => updateBackupSettings({ autoBackupFrequency: 'daily' }),
                      },
                      {
                        text: 'Weekly',
                        onPress: () => updateBackupSettings({ autoBackupFrequency: 'weekly' }),
                      },
                      {
                        text: 'Monthly',
                        onPress: () => updateBackupSettings({ autoBackupFrequency: 'monthly' }),
                      },
                    ],
                    true
                  );
                }}
                right={<ChevronRight size={16} color={theme.colors.textSecondary} />}
              />
            )}

            {!isWeb && (
              <SettingsRow
                testID="settings-create-backup"
                icon={<HardDrive size={15} color={theme.colors.primary} />}
                tone="primary"
                title="Create backup"
                subtitle="Save a copy on this device"
                onPress={createManualBackup}
                right={
                  loading ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <ChevronRight size={16} color={theme.colors.textSecondary} />
                  )
                }
              />
            )}

            <SettingsRow
              testID="settings-export"
              icon={<Download size={15} color={theme.colors.primary} />}
              tone="primary"
              title="Export backup"
              subtitle="Save a JSON copy of your data"
              onPress={exportBackup}
              right={
                loading ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <ChevronRight size={16} color={theme.colors.textSecondary} />
                )
              }
            />

            <SettingsRow
              last={isWeb}
              testID="settings-import"
              icon={<Upload size={15} color={theme.colors.success} />}
              tone="success"
              title="Import backup"
              subtitle="Restore from a backup file"
              onPress={importBackup}
              right={
                loading ? (
                  <ActivityIndicator size="small" color={theme.colors.success} />
                ) : (
                  <ChevronRight size={16} color={theme.colors.textSecondary} />
                )
              }
            />

            {!isWeb && (
              <SettingsRow
                testID="settings-delete-backup"
                last
                icon={<HardDrive size={15} color={theme.colors.error} />}
                title="Delete backup"
                titleColor={theme.colors.error}
                onPress={deleteBackup}
                right={<ChevronRight size={16} color={theme.colors.textSecondary} />}
              />
            )}
          </Card>

          {!isWeb && (
            <>
              <SectionHeader title="BACKUP INFORMATION" dotColor={theme.colors.primary} />
              <Card style={styles.sectionCard} padding={16}>
                <View style={styles.backupInfo}>
                  <View style={styles.backupInfoItem}>
                    <Text style={[typography.caption, styles.cycleInfoLabel, { color: theme.colors.textSecondary }]}>
                      Local backup
                    </Text>
                    <Text style={[typography.rowTitle, { color: theme.colors.primary }]}>
                      {backupStats.totalBackups > 0 ? 'Available' : 'None'}
                    </Text>
                  </View>
                  <View style={styles.backupInfoItem}>
                    <Text style={[typography.caption, styles.cycleInfoLabel, { color: theme.colors.textSecondary }]}>
                      Total size
                    </Text>
                    <Text style={[typography.rowTitle, { color: theme.colors.primary }]}>
                      {BackupService.formatFileSize(backupStats.totalSize)}
                    </Text>
                  </View>
                  <View style={styles.backupInfoItem}>
                    <Text style={[typography.caption, styles.cycleInfoLabel, { color: theme.colors.textSecondary }]}>
                      Last backup
                    </Text>
                    <Text style={[typography.rowTitle, { color: theme.colors.primary }]}>
                      {backupStats.lastBackup
                        ? backupStats.lastBackup.toLocaleDateString()
                        : 'Never'}
                    </Text>
                  </View>
                  {backupSettings.autoBackupEnabled && backupStats.nextAutoBackup && (
                    <View style={styles.backupInfoItem}>
                      <Text style={[typography.caption, styles.cycleInfoLabel, { color: theme.colors.textSecondary }]}>
                        Next auto backup
                      </Text>
                      <Text style={[typography.rowTitle, { color: theme.colors.primary }]}>
                        {backupStats.nextAutoBackup.toLocaleDateString()}
                      </Text>
                    </View>
                  )}
                </View>
              </Card>
            </>
          )}

          {__DEV__ && (
            <>
              <SectionHeader title="DEVELOPER" dotColor={theme.colors.warning} />
              <Card style={styles.sectionCard} padding={14}>
                <SettingsRow
                  testID="settings-dev-seed"
                  icon={<Database size={15} color={theme.colors.primary} />}
                  tone="primary"
                  title="Load demo data"
                  subtitle="Replace the database with deterministic sample data"
                  onPress={loadDemoData}
                  right={<ChevronRight size={16} color={theme.colors.textSecondary} />}
                />
                <SettingsRow
                  last
                  testID="settings-dev-reset"
                  icon={<RefreshCw size={15} color={theme.colors.error} />}
                  title="Reset demo data"
                  titleColor={theme.colors.error}
                  onPress={confirmResetDemoData}
                  right={<ChevronRight size={16} color={theme.colors.textSecondary} />}
                />
              </Card>
            </>
          )}

          <SectionHeader title="DATA MANAGEMENT" dotColor={theme.colors.error} />
          <Card style={styles.sectionCard} padding={14}>
            <SettingsRow
              last
              testID="settings-clear-all"
              icon={<Trash2 size={15} color={theme.colors.error} />}
              title="Clear all data"
              titleColor={theme.colors.error}
              subtitle="Delete cycle data, private activity and backups"
              onPress={clearAllData}
              right={<ChevronRight size={16} color={theme.colors.textSecondary} />}
            />
          </Card>

          <Card style={styles.privacyNote} padding={14}>
            <IconTile size={30} tone="success">
              <Shield size={15} color={theme.colors.success} />
            </IconTile>
            <View style={styles.privacyCopy}>
              <Text
                style={[
                  typography.rowTitle,
                  { color: theme.isDark ? '#a5d6a7' : '#2e7d32' },
                ]}>
                Your privacy matters
              </Text>
              <Text
                style={[
                  typography.caption,
                  styles.privacyText,
                  { color: theme.isDark ? '#a5d6a7' : '#388e3c' },
                ]}>
                All data stays on your device. Nothing is collected or synced. Private entries are
                PIN-locked and only included in backups if you opt in.
              </Text>
            </View>
          </Card>
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
    sectionCard: {
      marginHorizontal: 20,
      marginTop: 0,
    },
    cardTitle: {
      marginBottom: 2,
    },
    cardSubtitle: {
      marginBottom: 12,
    },
    cycleInfo: {
      gap: 10,
      marginTop: 10,
    },
    cycleInfoItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 2,
    },
    cycleInfoLabel: {
      flexShrink: 1,
    },
    webNotice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 8,
      borderRadius: radii.sm,
      borderWidth: 1,
      marginBottom: 8,
    },
    webNoticeText: {
      flex: 1,
      lineHeight: 15,
    },
    backupInfo: {
      gap: 10,
    },
    backupInfoItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    privacyNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginHorizontal: 20,
      marginTop: 20,
      marginBottom: 24,
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
  });
