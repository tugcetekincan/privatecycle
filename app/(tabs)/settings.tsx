import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
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
  RefreshCw
} from 'lucide-react-native';
import { DataService } from '@/services/DataService';
import { BackupService, BackupSettings } from '@/services/BackupService';
import { useTheme } from '@/hooks/useTheme';
import { useAutoBackup } from '@/hooks/useAutoBackup';

export default function SettingsTab() {
  const { theme, toggleTheme, isDark } = useTheme();
  const { triggerAutoBackup } = useAutoBackup();
  const [notifications, setNotifications] = useState(true);
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
      Alert.alert('Error', 'Failed to update backup settings');
    }
  };

  const createManualBackup = async () => {
    setLoading(true);
    try {
      const filePath = await BackupService.exportBackup({ saveToDevice: true, shareFile: true });
      await loadBackupData();
      Alert.alert('Success', 'Backup created and saved successfully!');
    } catch (error) {
      console.error('Error creating backup:', error);
      Alert.alert('Error', 'Failed to create backup');
    } finally {
      setLoading(false);
    }
  };

  const exportBackup = async () => {
    setLoading(true);
    try {
      await BackupService.exportBackup({ shareFile: true });
    } catch (error) {
      console.error('Error exporting backup:', error);
      Alert.alert('Error', 'Failed to export backup');
    } finally {
      setLoading(false);
    }
  };

  const importBackup = async () => {
    Alert.alert(
      'Import Backup',
      'This will replace all your current data with the backup data. Are you sure you want to continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const result = await BackupService.importBackup();
              if (result.success) {
                await loadBackupData();
                Alert.alert(
                  'Import Successful',
                  result.message + (result.stats ? `\n\nBackup Details:\n• Version: ${result.stats.version}\n• Date: ${result.stats.timestamp}\n• Days: ${result.stats.totalDays}` : ''),
                  [{ text: 'OK' }]
                );
              } else {
                Alert.alert('Import Failed', result.message);
              }
            } catch (error) {
              console.error('Error importing backup:', error);
              Alert.alert('Error', 'Failed to import backup');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const manageLocalBackups = async () => {
    try {
      const backups = await BackupService.getLocalBackups();
      if (backups.length === 0) {
        Alert.alert('No Backups', 'No local backups found.');
        return;
      }

      const backupList = backups.map((backup, index) => 
        `${index + 1}. ${backup.name}\n   Size: ${BackupService.formatFileSize(backup.size)}\n   Date: ${backup.date.toLocaleDateString()}`
      ).join('\n\n');

      Alert.alert(
        'Local Backups',
        `Found ${backups.length} local backup(s):\n\n${backupList}`,
        [
          { text: 'Close', style: 'cancel' },
          {
            text: 'Delete All',
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                'Delete All Backups',
                'Are you sure you want to delete all local backups?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        for (const backup of backups) {
                          await BackupService.deleteBackup(backup.path);
                        }
                        await loadBackupData();
                        Alert.alert('Success', 'All local backups deleted.');
                      } catch (error) {
                        Alert.alert('Error', 'Failed to delete backups');
                      }
                    }
                  }
                ]
              );
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error managing backups:', error);
      Alert.alert('Error', 'Failed to load backup list');
    }
  };

  const clearAllData = () => {
    Alert.alert(
      'Clear All Data',
      'Are you sure you want to delete all your tracking data AND all backups? This action cannot be undone.\n\nConsider exporting a backup first!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export Backup First',
          onPress: exportBackup
        },
        { 
          text: 'Delete Everything', 
          style: 'destructive',
          onPress: async () => {
            try {
              await BackupService.clearAllData();
              await loadBackupData();
              Alert.alert('Success', 'All data and backups have been cleared.');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear all data');
            }
          }
        },
      ]
    );
  };

  const showAbout = () => {
    Alert.alert(
      'About Period Tracker',
      'A simple and private period tracking app to help you monitor your menstrual cycle, symptoms, and overall health patterns.\n\nVersion 1.0.0',
      [{ text: 'OK' }]
    );
  };

  const showHelp = () => {
    Alert.alert(
      'Help',
      '• Use the Calendar tab to view your cycle\n• Track your period, symptoms, and mood daily\n• View insights and patterns in the Insights tab\n• All data is stored locally on your device',
      [{ text: 'OK' }]
    );
  };

  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <SettingsIcon size={24} color={theme.colors.primary} />
        </View>

        {/* App Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Settings</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Bell size={20} color={theme.colors.textSecondary} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Notifications</Text>
                <Text style={styles.settingSubtitle}>Period reminders and tips</Text>
              </View>
            </View>
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={notifications ? theme.colors.white : theme.colors.white}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Moon size={20} color={theme.colors.textSecondary} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Dark Mode</Text>
                <Text style={styles.settingSubtitle}>Switch to dark theme</Text>
              </View>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={isDark ? theme.colors.white : theme.colors.white}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Shield size={20} color={theme.colors.textSecondary} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Private Mode</Text>
                <Text style={styles.settingSubtitle}>Hide sensitive information</Text>
              </View>
            </View>
            <Switch
              value={privateMode}
              onValueChange={setPrivateMode}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={privateMode ? theme.colors.white : theme.colors.white}
            />
          </View>
        </View>

        {/* Cycle Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cycle Settings</Text>
          
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Cycle Information</Text>
            <View style={styles.cycleInfo}>
              <View style={styles.cycleInfoItem}>
                <Text style={styles.cycleInfoLabel}>Average Cycle Length</Text>
                <Text style={styles.cycleInfoValue}>28 days</Text>
              </View>
              <View style={styles.cycleInfoItem}>
                <Text style={styles.cycleInfoLabel}>Period Length</Text>
                <Text style={styles.cycleInfoValue}>5 days</Text>
              </View>
              <View style={styles.cycleInfoItem}>
                <Text style={styles.cycleInfoLabel}>Luteal Phase</Text>
                <Text style={styles.cycleInfoValue}>14 days</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Support */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          
          <TouchableOpacity style={styles.button} onPress={showHelp}>
            <HelpCircle size={20} color={theme.colors.success} />
            <Text style={styles.buttonText}>Help & FAQ</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={showAbout}>
            <SettingsIcon size={20} color={theme.colors.textSecondary} />
            <Text style={styles.buttonText}>About</Text>
          </TouchableOpacity>
        </View>

        {/* Backup & Restore */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Backup & Restore</Text>
          
          {/* Auto Backup Settings */}
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <RefreshCw size={20} color={theme.colors.textSecondary} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Auto Backup</Text>
                <Text style={styles.settingSubtitle}>Automatically create backups</Text>
              </View>
            </View>
            <Switch
              value={backupSettings.autoBackupEnabled}
              onValueChange={(value) => updateBackupSettings({ autoBackupEnabled: value })}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={backupSettings.autoBackupEnabled ? theme.colors.white : theme.colors.white}
            />
          </View>

          {/* Backup Frequency */}
          {backupSettings.autoBackupEnabled && (
            <TouchableOpacity 
              style={styles.settingItem}
              onPress={() => {
                Alert.alert(
                  'Backup Frequency',
                  'Choose how often to create automatic backups',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Daily', onPress: () => updateBackupSettings({ autoBackupFrequency: 'daily' }) },
                    { text: 'Weekly', onPress: () => updateBackupSettings({ autoBackupFrequency: 'weekly' }) },
                    { text: 'Monthly', onPress: () => updateBackupSettings({ autoBackupFrequency: 'monthly' }) },
                  ]
                );
              }}
            >
              <View style={styles.settingInfo}>
                <Clock size={20} color={theme.colors.textSecondary} />
                <View style={styles.settingText}>
                  <Text style={styles.settingTitle}>Backup Frequency</Text>
                  <Text style={styles.settingSubtitle}>Currently: {backupSettings.autoBackupFrequency}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* Backup Actions */}
          <TouchableOpacity 
            style={styles.button} 
            onPress={createManualBackup}
            disabled={loading}
          >
            <HardDrive size={20} color={theme.colors.primary} />
            <Text style={styles.buttonText}>Create Backup</Text>
            {loading && <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginLeft: 10 }} />}
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.button} 
            onPress={exportBackup}
            disabled={loading}
          >
            <Download size={20} color={theme.colors.success} />
            <Text style={styles.buttonText}>Export Backup</Text>
            {loading && <ActivityIndicator size="small" color={theme.colors.success} style={{ marginLeft: 10 }} />}
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.button} 
            onPress={importBackup}
            disabled={loading}
          >
            <Upload size={20} color={theme.colors.accent} />
            <Text style={styles.buttonText}>Import Backup</Text>
            {loading && <ActivityIndicator size="small" color={theme.colors.accent} style={{ marginLeft: 10 }} />}
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.button} 
            onPress={manageLocalBackups}
          >
            <HardDrive size={20} color={theme.colors.textSecondary} />
            <Text style={styles.buttonText}>Manage Local Backups</Text>
          </TouchableOpacity>
        </View>

        {/* Backup Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Backup Information</Text>
          
          <View style={styles.card}>
            <View style={styles.backupInfo}>
              <View style={styles.backupInfoItem}>
                <Text style={styles.backupInfoLabel}>Local Backups</Text>
                <Text style={styles.backupInfoValue}>{backupStats.totalBackups}</Text>
              </View>
              <View style={styles.backupInfoItem}>
                <Text style={styles.backupInfoLabel}>Total Size</Text>
                <Text style={styles.backupInfoValue}>
                  {BackupService.formatFileSize(backupStats.totalSize)}
                </Text>
              </View>
              <View style={styles.backupInfoItem}>
                <Text style={styles.backupInfoLabel}>Last Backup</Text>
                <Text style={styles.backupInfoValue}>
                  {backupStats.lastBackup ? backupStats.lastBackup.toLocaleDateString() : 'Never'}
                </Text>
              </View>
              {backupSettings.autoBackupEnabled && backupStats.nextAutoBackup && (
                <View style={styles.backupInfoItem}>
                  <Text style={styles.backupInfoLabel}>Next Auto Backup</Text>
                  <Text style={styles.backupInfoValue}>
                    {backupStats.nextAutoBackup.toLocaleDateString()}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Data Management */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Management</Text>
          
          <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={clearAllData}>
            <Trash2 size={20} color={theme.colors.error} />
            <Text style={[styles.buttonText, styles.dangerText]}>Clear All Data</Text>
          </TouchableOpacity>
        </View>

        {/* Privacy Notice */}
        <View style={styles.privacyCard}>
          <Text style={styles.privacyTitle}>🔒 Your Privacy Matters</Text>
          <Text style={styles.privacyText}>
            All your data is stored locally on your device. We don't collect, share, or sync your personal information with any servers.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  section: {
    marginVertical: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    marginLeft: 15,
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
  },
  settingSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 12,
    elevation: 2,
    shadowColor: theme.colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 15,
  },
  cycleInfo: {
    gap: 12,
  },
  cycleInfoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cycleInfoLabel: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  cycleInfoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.primary,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  buttonText: {
    fontSize: 16,
    color: theme.colors.text,
    marginLeft: 15,
  },
  dangerButton: {
    backgroundColor: theme.colors.surface,
  },
  dangerText: {
    color: theme.colors.error,
  },
  privacyCard: {
    backgroundColor: theme.isDark ? '#1a3d1a' : '#e8f5e8',
    marginHorizontal: 20,
    marginVertical: 20,
    padding: 20,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.success,
  },
  privacyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.isDark ? '#81c784' : '#2e7d32',
    marginBottom: 8,
  },
  privacyText: {
    fontSize: 14,
    color: theme.isDark ? '#a5d6a7' : '#388e3c',
    lineHeight: 20,
  },
  backupInfo: {
    gap: 12,
  },
  backupInfoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backupInfoLabel: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  backupInfoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.primary,
  },
});