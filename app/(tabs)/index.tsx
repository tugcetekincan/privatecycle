import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { DataService } from '@/services/DataService';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@/hooks/useTheme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function CalendarTab() {
  const { theme } = useTheme();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [periodDates, setPeriodDates] = useState<string[]>([]);
  const [noPeriodDates, setNoPeriodDates] = useState<string[]>([]);
  const [nextPeriod, setNextPeriod] = useState<Date | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    const data = await DataService.getPeriodData();
    const dailyData = await DataService.getAllDailyData();
    setPeriodDates(data.periods);
    
    // Get dates where user explicitly marked "no period"
    const noPeriodDates = Object.entries(dailyData)
      .filter(([_, dayData]) => !dayData.isPeriod)
      .map(([date, _]) => date);
    setNoPeriodDates(noPeriodDates);
    
    // Calculate next predicted period considering all tracked data
    if (data.periods.length >= 1) {
      const sortedPeriods = data.periods.sort();
      
      // Find all period start dates (first day of each consecutive period group)
      const periodStarts: string[] = [];
      const periodSet = new Set(sortedPeriods);
      
      for (const periodDate of sortedPeriods) {
        const prevDay = new Date(periodDate);
        prevDay.setDate(prevDay.getDate() - 1);
        const prevDayStr = prevDay.toISOString().split('T')[0];
        
        if (!periodSet.has(prevDayStr)) {
          periodStarts.push(periodDate);
        }
      }
      
      if (periodStarts.length >= 2) {
        const avgCycle = calculateAverageCycleFromStarts(periodStarts);
        const lastPeriodStart = new Date(periodStarts[periodStarts.length - 1]);
        const predicted = new Date(lastPeriodStart);
        predicted.setDate(predicted.getDate() + avgCycle);
        setNextPeriod(predicted);
      } else if (periodStarts.length === 1) {
        // Use default cycle length for first prediction
        const lastPeriodStart = new Date(periodStarts[0]);
        const predicted = new Date(lastPeriodStart);
        predicted.setDate(predicted.getDate() + 28); // Default cycle
        setNextPeriod(predicted);
      }
    }
  };

  const calculateAverageCycle = (periods: string[], noPeriodDates?: string[]): number => {
    if (periods.length < 2) return 28;
    
    const cycles: number[] = [];
    const sortedPeriods = periods.sort();
    
    for (let i = 1; i < sortedPeriods.length; i++) {
      const prev = new Date(sortedPeriods[i - 1]);
      const curr = new Date(sortedPeriods[i]);
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      cycles.push(diff);
    }
    
    return Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length);
  };

  const calculateAverageCycleFromStarts = (periodStarts: string[]): number => {
    if (periodStarts.length < 2) return 28;
    
    const cycles: number[] = [];
    const sortedStarts = periodStarts.sort();
    
    for (let i = 1; i < sortedStarts.length; i++) {
      const prev = new Date(sortedStarts[i - 1]);
      const curr = new Date(sortedStarts[i]);
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      cycles.push(diff);
    }
    
    return Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length);
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const formatDateKey = (date: Date) => {
    return DataService.formatDateKey(date);
  };

  const isPeriodDay = (date: Date) => {
    return periodDates.includes(formatDateKey(date));
  };

  const isNoPeriodDay = (date: Date) => {
    return noPeriodDates.includes(formatDateKey(date));
  };

  const isPredictedPeriod = (date: Date) => {
    if (!nextPeriod) return false;
    const daysDiff = (date.getTime() - nextPeriod.getTime()) / (1000 * 60 * 60 * 24);
    // Show predicted period from start date to start date + typical period length (5-7 days)
    return daysDiff >= 0 && daysDiff <= 6;
  };

  // Helper function to determine period day position for pill styling
  const getPeriodDayPosition = (date: Date): 'single' | 'start' | 'middle' | 'end' => {
    const dateKey = formatDateKey(date);
    if (!periodDates.includes(dateKey)) return 'single';

    const prevDay = new Date(date);
    prevDay.setDate(prevDay.getDate() - 1);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    const isPrevPeriod = periodDates.includes(formatDateKey(prevDay));
    const isNextPeriod = periodDates.includes(formatDateKey(nextDay));

    if (!isPrevPeriod && !isNextPeriod) return 'single';
    if (!isPrevPeriod && isNextPeriod) return 'start';
    if (isPrevPeriod && !isNextPeriod) return 'end';
    return 'middle';
  };

  // Helper function to get period day border radius based on position
  const getPeriodDayBorderRadius = (position: 'single' | 'start' | 'middle' | 'end') => {
    switch (position) {
      case 'single':
        return { borderRadius: 20 };
      case 'start':
        return { borderTopLeftRadius: 20, borderBottomLeftRadius: 20, borderTopRightRadius: 0, borderBottomRightRadius: 0 };
      case 'middle':
        return { borderRadius: 0 };
      case 'end':
        return { borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderTopRightRadius: 20, borderBottomRightRadius: 20 };
      default:
        return { borderRadius: 20 };
    }
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const renderCalendarDays = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = [];

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(<View key={`empty-${i}`} style={styles.emptyDay} />);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const isToday = formatDateKey(date) === formatDateKey(new Date());
      const isPeriod = isPeriodDay(date);
      const isNoPeriod = isNoPeriodDay(date);
      const isPredicted = isPredictedPeriod(date);
      
      // Get period day position for pill styling
      const periodPosition = isPeriod ? getPeriodDayPosition(date) : 'single';
      const periodBorderRadius = isPeriod ? getPeriodDayBorderRadius(periodPosition) : {};

      days.push(
        <View
          key={day}
          style={[
            styles.dayCell,
            isToday && styles.today,
            isPeriod && [styles.periodDay, periodBorderRadius],
            isNoPeriod && styles.noPeriodDay,
            isPredicted && styles.predictedDay,
          ]}>
          <Text
            style={[
              styles.dayText,
              isToday && styles.todayText,
              isPeriod && styles.periodText,
              isNoPeriod && styles.noPeriodText,
              isPredicted && styles.predictedText,
            ]}>
            {day}
          </Text>
        </View>
      );
    }

    return days;
  };

  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Period Calendar</Text>
          <CalendarIcon size={24} color={theme.colors.primary} />
        </View>

        {/* Calendar Navigation */}
        <View style={styles.calendarHeader}>
          <TouchableOpacity onPress={() => navigateMonth('prev')}>
            <ChevronLeft size={24} color={theme.colors.primary} />
          </TouchableOpacity>
          <Text style={styles.monthYear}>
            {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
          </Text>
          <TouchableOpacity onPress={() => navigateMonth('next')}>
            <ChevronRight size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Calendar */}
        <View style={styles.calendar}>
          {/* Day headers */}
          <View style={styles.dayHeaders}>
            {DAYS.map(day => (
              <Text key={day} style={styles.dayHeader}>
                {day}
              </Text>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={styles.calendarGrid}>
            {renderCalendarDays()}
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.primary }]} />
            <Text style={styles.legendText}>Period</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.secondary, borderWidth: 1, borderColor: theme.colors.border }]} />
            <Text style={styles.legendText}>No Period</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.isDark ? '#8e24aa' : '#ffb3d1' }]} />
            <Text style={styles.legendText}>Predicted</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.accent }]} />
            <Text style={styles.legendText}>Today</Text>
          </View>
        </View>

        {/* Next Period Prediction */}
        {nextPeriod && (
          <View style={styles.predictionCard}>
            <Text style={styles.predictionTitle}>Next Period</Text>
            <Text style={styles.predictionDate}>
              {nextPeriod.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </Text>
          </View>
        )}
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
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  monthYear: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
  },
  calendar: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 15,
    elevation: 2,
    shadowColor: theme.colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dayHeaders: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dayHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    width: 40,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: 10,
  },
  emptyDay: {
    width: '14.28%',
    height: 40,
  },
  dayCell: {
    width: '14.28%',
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayText: {
    fontSize: 16,
    color: theme.colors.text,
  },
  today: {
    backgroundColor: theme.colors.accent,
    borderRadius: 20,
  },
  todayText: {
    color: theme.colors.white,
    fontWeight: 'bold',
  },
  periodDay: {
    backgroundColor: theme.colors.primary,
  },
  periodText: {
    color: theme.colors.white,
    fontWeight: 'bold',
  },
  noPeriodDay: {
    backgroundColor: theme.colors.secondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
  },
  noPeriodText: {
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  predictedDay: {
    backgroundColor: theme.isDark ? '#8e24aa' : '#ffb3d1',
    borderRadius: 20,
  },
  predictedText: {
    color: theme.isDark ? theme.colors.white : theme.colors.text,
    fontWeight: '500',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  predictionCard: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    padding: 20,
    elevation: 2,
    shadowColor: theme.colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  predictionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 5,
  },
  predictionDate: {
    fontSize: 16,
    color: theme.colors.text,
  },
});