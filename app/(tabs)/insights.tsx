import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { ChartBar as BarChart2, TrendingUp, Calendar, Heart } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DataService } from '@/services/DataService';
import { useTheme } from '@/hooks/useTheme';

export default function InsightsTab() {
  const { theme } = useTheme();
  const [stats, setStats] = useState({
    averageCycle: 28,
    lastPeriodLength: 0,
    nextPeriodIn: 0,
    totalPeriods: 0,
    commonSymptoms: [] as Array<{symptom: string, count: number}>,
    moodTrends: [] as Array<{mood: string, count: number}>,
  });

  const loadInsights = useCallback(async () => {
    const data = await DataService.getInsights();
    setStats(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadInsights();
    }, [loadInsights])
  );

  const getSymptomEmoji = (symptom: string) => {
    const emojiMap: { [key: string]: string } = {
      cramps: '😣',
      headache: '🤕',
      bloating: '😵',
      breastache: '🤱',
      mood: '😢',
      fatigue: '😴',
      backache: '😖',
    };
    return emojiMap[symptom] || '💊';
  };

  const getMoodEmoji = (mood: string) => {
    const emojiMap: { [key: string]: string } = {
      happy: '😊',
      sad: '😢',
      anxious: '😰',
      irritated: '😤',
      calm: '😌',
    };
    return emojiMap[mood] || '😐';
  };

  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Insights</Text>
          <BarChart2 size={24} color={theme.colors.primary} />
        </View>

        {/* Cycle Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Calendar size={32} color={theme.colors.primary} />
            <Text style={styles.statNumber}>{stats.averageCycle}</Text>
            <Text style={styles.statLabel}>Avg Cycle Length</Text>
            <Text style={styles.statUnit}>days</Text>
          </View>

          <View style={styles.statCard}>
            <Heart size={32} color={theme.colors.error} />
            <Text style={styles.statNumber}>{stats.lastPeriodLength}</Text>
            <Text style={styles.statLabel}>Last Period</Text>
            <Text style={styles.statUnit}>days</Text>
          </View>

          <View style={styles.statCard}>
            <TrendingUp size={32} color={theme.colors.success} />
            <Text style={styles.statNumber}>{stats.nextPeriodIn}</Text>
            <Text style={styles.statLabel}>Next Period</Text>
            <Text style={styles.statUnit}>days</Text>
          </View>

          <View style={styles.statCard}>
            <BarChart2 size={32} color={theme.colors.warning} />
            <Text style={styles.statNumber}>{stats.totalPeriods}</Text>
            <Text style={styles.statLabel}>Total Tracked</Text>
            <Text style={styles.statUnit}>periods</Text>
          </View>
        </View>

        {/* Common Symptoms */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Most Common Symptoms</Text>
          {stats.commonSymptoms.length > 0 ? (
            <View style={styles.symptomsList}>
              {stats.commonSymptoms.map((item, index) => (
                <View key={index} style={styles.symptomItem}>
                  <View style={styles.symptomInfo}>
                    <Text style={styles.symptomEmoji}>
                      {getSymptomEmoji(item.symptom)}
                    </Text>
                    <Text style={styles.symptomName}>
                      {item.symptom.charAt(0).toUpperCase() + item.symptom.slice(1)}
                    </Text>
                  </View>
                  <View style={styles.symptomBar}>
                    <View 
                      style={[
                        styles.symptomBarFill, 
                        { width: `${(item.count / Math.max(...stats.commonSymptoms.map(s => s.count))) * 100}%` }
                      ]} 
                    />
                    <Text style={styles.symptomCount}>{item.count}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.noDataText}>Start tracking to see your patterns!</Text>
          )}
        </View>

        {/* Mood Trends */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mood Patterns</Text>
          {stats.moodTrends.length > 0 ? (
            <View style={styles.moodsList}>
              {stats.moodTrends.map((item, index) => (
                <View key={index} style={styles.moodItem}>
                  <Text style={styles.moodEmoji}>
                    {getMoodEmoji(item.mood)}
                  </Text>
                  <View style={styles.moodInfo}>
                    <Text style={styles.moodName}>
                      {item.mood.charAt(0).toUpperCase() + item.mood.slice(1)}
                    </Text>
                    <View style={styles.moodBar}>
                      <View 
                        style={[
                          styles.moodBarFill, 
                          { width: `${(item.count / Math.max(...stats.moodTrends.map(m => m.count))) * 100}%` }
                        ]} 
                      />
                    </View>
                    <Text style={styles.moodCount}>{item.count} days</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.noDataText}>Track your moods to see trends!</Text>
          )}
        </View>

        {/* Health Tips */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Health Tips</Text>
          <View style={styles.tipsList}>
            <View style={styles.tip}>
              <Text style={styles.tipEmoji}>💧</Text>
              <Text style={styles.tipText}>Stay hydrated during your period</Text>
            </View>
            <View style={styles.tip}>
              <Text style={styles.tipEmoji}>🏃‍♀️</Text>
              <Text style={styles.tipText}>Light exercise can help with cramps</Text>
            </View>
            <View style={styles.tip}>
              <Text style={styles.tipEmoji}>🍫</Text>
              <Text style={styles.tipText}>Dark chocolate may reduce PMS symptoms</Text>
            </View>
            <View style={styles.tip}>
              <Text style={styles.tipEmoji}>😴</Text>
              <Text style={styles.tipText}>Get enough sleep for hormonal balance</Text>
            </View>
          </View>
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  statCard: {
    width: '48%',
    backgroundColor: theme.colors.surface,
    marginBottom: 15,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 2,
    shadowColor: theme.colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 10,
  },
  statLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 5,
  },
  statUnit: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
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
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 15,
  },
  noDataText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 20,
  },
  symptomsList: {
    gap: 15,
  },
  symptomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  symptomInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  symptomEmoji: {
    fontSize: 20,
    marginRight: 10,
  },
  symptomName: {
    fontSize: 16,
    color: theme.colors.text,
    flex: 1,
  },
  symptomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 10,
  },
  symptomBarFill: {
    height: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 4,
    minWidth: 20,
  },
  symptomCount: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 8,
    minWidth: 20,
  },
  moodsList: {
    gap: 15,
  },
  moodItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  moodEmoji: {
    fontSize: 24,
    marginRight: 15,
  },
  moodInfo: {
    flex: 1,
  },
  moodName: {
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 5,
  },
  moodBar: {
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: 3,
    marginBottom: 5,
  },
  moodBarFill: {
    height: '100%',
    backgroundColor: theme.colors.warning,
    borderRadius: 3,
    minWidth: 10,
  },
  moodCount: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  tipsList: {
    gap: 15,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tipEmoji: {
    fontSize: 20,
    marginRight: 15,
  },
  tipText: {
    fontSize: 16,
    color: theme.colors.text,
    flex: 1,
    lineHeight: 22,
  },
});