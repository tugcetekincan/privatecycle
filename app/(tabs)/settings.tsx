import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Switch,
} from 'react-native';
import { Settings as SettingsIcon, Bell, Moon, Shield, CircleHelp as HelpCircle, Trash2 } from 'lucide-react-native';
import { DataService } from '@/services/DataService';
import { useTheme } from '@/hooks/useTheme';

export default function SettingsTab() {
  const { theme, toggleTheme, isDark } = useTheme();
  const [notifications, setNotifications] = useState(true);
  const [privateMode, setPrivateMode] = useState(false);

  const clearAllData = () => {
    Alert.alert(
      'Clear All Data',
      'Are you sure you want to delete all your tracking data? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            await DataService.clearAllData();
            Alert.alert('Success', 'All data has been cleared.');
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
});