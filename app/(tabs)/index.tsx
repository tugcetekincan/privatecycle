import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  PanResponder,
  Animated,
  Dimensions,
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

const { width: screenWidth } = Dimensions.get('window');

export default function CalendarTab() {
  const { theme } = useTheme();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [periodDates, setPeriodDates] = useState<string[]>([]);
  const [noPeriodDates, setNoPeriodDates] = useState<string[]>([]);
  const [nextPeriod, setNextPeriod] = useState<Date | null>(null);
  const [futurePeriods, setFuturePeriods] = useState<Date[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  
  const slideAnim = useRef(new Animated.Value(0)).current;
  const nextMonthAnim = useRef(new Animated.Value(screenWidth)).current;

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
    
    // Calculate multiple predicted periods considering all tracked data
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
        const cycleVariability = calculateCycleVariability(periodStarts);
        const lastPeriodStart = new Date(periodStarts[periodStarts.length - 1]);
        
        // Calculate multiple future periods (next 6 periods)
        const predictions: Date[] = [];
        for (let i = 1; i <= 6; i++) {
          const predicted = new Date(lastPeriodStart);
          // Add some variability to predictions beyond the first one
          const adjustment = i > 1 ? Math.round((Math.random() - 0.5) * cycleVariability * 0.5) : 0;
          predicted.setDate(predicted.getDate() + (avgCycle * i) + adjustment);
          predictions.push(predicted);
        }
        
        setNextPeriod(predictions[0]);
        setFuturePeriods(predictions);
      } else if (periodStarts.length === 1) {
        // Use default cycle length for predictions
        const lastPeriodStart = new Date(periodStarts[0]);
        const predictions: Date[] = [];
        
        for (let i = 1; i <= 6; i++) {
          const predicted = new Date(lastPeriodStart);
          predicted.setDate(predicted.getDate() + (28 * i)); // Default cycle
          predictions.push(predicted);
        }
        
        setNextPeriod(predictions[0]);
        setFuturePeriods(predictions);
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

  const calculateCycleVariability = (periodStarts: string[]): number => {
    if (periodStarts.length < 3) return 2; // Default variability
    
    const cycles: number[] = [];
    const sortedStarts = periodStarts.sort();
    
    for (let i = 1; i < sortedStarts.length; i++) {
      const prev = new Date(sortedStarts[i - 1]);
      const curr = new Date(sortedStarts[i]);
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      cycles.push(diff);
    }
    
    const mean = cycles.reduce((a, b) => a + b, 0) / cycles.length;
    const variance = cycles.reduce((acc, cycle) => acc + Math.pow(cycle - mean, 2), 0) / cycles.length;
    return Math.sqrt(variance);
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
    if (futurePeriods.length === 0) return false;
    
    // Check if date falls within any predicted period (6-7 days each)
    return futurePeriods.some(periodStart => {
      const daysDiff = (date.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff >= 0 && daysDiff <= 6;
    });
  };



  // Generic helper function to determine day position for pill styling
  const getDayPosition = (date: Date, checkFunction: (d: Date) => boolean): 'single' | 'start' | 'middle' | 'end' => {
    if (!checkFunction(date)) return 'single';

    const prevDay = new Date(date);
    prevDay.setDate(prevDay.getDate() - 1);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    const isPrevSameType = checkFunction(prevDay);
    const isNextSameType = checkFunction(nextDay);

    if (!isPrevSameType && !isNextSameType) return 'single';
    if (!isPrevSameType && isNextSameType) return 'start';
    if (isPrevSameType && !isNextSameType) return 'end';
    return 'middle';
  };

  // Generic helper function to get day border radius based on position
  const getDayBorderRadius = (position: 'single' | 'start' | 'middle' | 'end') => {
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

  const [animationDirection, setAnimationDirection] = useState<'prev' | 'next'>('next');
  const [nextMonthDate, setNextMonthDate] = useState<Date | null>(null);

  const navigateMonth = (direction: 'prev' | 'next') => {
    if (isAnimating) return;
    
    // Calculate the target date before starting animation
    const targetDate = new Date(currentDate);
    if (direction === 'prev') {
      targetDate.setMonth(targetDate.getMonth() - 1);
    } else {
      targetDate.setMonth(targetDate.getMonth() + 1);
    }
    
    setIsAnimating(true);
    setAnimationDirection(direction);
    setNextMonthDate(targetDate);
    
    const slideOutDistance = direction === 'next' ? -screenWidth : screenWidth;
    const slideInStartDistance = direction === 'next' ? screenWidth : -screenWidth;
    
    // Reset next month position
    nextMonthAnim.setValue(slideInStartDistance);
    
    // Animate current month out and next month in
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: slideOutDistance,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(nextMonthAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Update the current date to the target date
      setCurrentDate(targetDate);
      
      // Reset animation values smoothly
      requestAnimationFrame(() => {
        slideAnim.setValue(0);
        nextMonthAnim.setValue(screenWidth);
        setIsAnimating(false);
        setNextMonthDate(null);
      });
    });
  };

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 20;
    },
    onPanResponderGrant: () => {
      // Gesture started
    },
    onPanResponderMove: () => {
      // Handle move if needed for visual feedback
    },
    onPanResponderRelease: (evt, gestureState) => {
      const swipeThreshold = 50;
      
      if (Math.abs(gestureState.dx) > swipeThreshold) {
        if (gestureState.dx > 0) {
          // Swipe right - go to previous month
          navigateMonth('prev');
        } else {
          // Swipe left - go to next month
          navigateMonth('next');
        }
      }
    },
    onPanResponderTerminationRequest: () => true,
  });

  const renderCalendarDays = (date: Date) => {
    const daysInMonth = getDaysInMonth(date);
    const firstDay = getFirstDayOfMonth(date);
    const days = [];

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(<View key={`empty-${i}`} style={styles.emptyDay} />);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayDate = new Date(date.getFullYear(), date.getMonth(), day);
      const isToday = formatDateKey(dayDate) === formatDateKey(new Date());
      const isPeriod = isPeriodDay(dayDate);
      const isNoPeriod = isNoPeriodDay(dayDate);
      const isPredicted = isPredictedPeriod(dayDate);
      
      // Get day positions for pill styling
      const periodPosition = isPeriod ? getDayPosition(dayDate, isPeriodDay) : 'single';
      const noPeriodPosition = isNoPeriod ? getDayPosition(dayDate, isNoPeriodDay) : 'single';
      const predictedPosition = isPredicted ? getDayPosition(dayDate, isPredictedPeriod) : 'single';
      
      // Get border radius styles
      const periodBorderRadius = isPeriod ? getDayBorderRadius(periodPosition) : {};
      const noPeriodBorderRadius = isNoPeriod ? getDayBorderRadius(noPeriodPosition) : {};
      const predictedBorderRadius = isPredicted ? getDayBorderRadius(predictedPosition) : {};

      days.push(
        <View
          key={day}
          style={[
            styles.dayCell,
            isToday && styles.today,
            isPeriod && [styles.periodDay, periodBorderRadius],
            isNoPeriod && [styles.noPeriodDay, noPeriodBorderRadius],
            isPredicted && [styles.predictedDay, predictedBorderRadius],
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

  const renderCalendarContent = (date: Date) => (
    <>
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
        {renderCalendarDays(date)}
      </View>
    </>
  );



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
        <View style={styles.calendarContainer} {...panResponder.panHandlers}>
          {/* Current Month */}
          <Animated.View style={[
            styles.calendar,
            {
              transform: [{ translateX: slideAnim }],
            },
          ]}>
            {renderCalendarContent(currentDate)}
          </Animated.View>

                    {/* Next Month (for animation) */}
          {isAnimating && nextMonthDate && (
            <Animated.View style={[
              styles.calendar,
              styles.nextMonthCalendar,
              {
                transform: [{ translateX: nextMonthAnim }],
              },
            ]}>
              {renderCalendarContent(nextMonthDate)}
            </Animated.View>
          )}
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

        {/* Future Period Predictions */}
        {futurePeriods.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming Periods</Text>
            <View style={styles.card}>
              <View style={styles.predictionInfo}>
                {futurePeriods.slice(0, 3).map((period, index) => {
                  const today = new Date();
                  const daysUntil = Math.ceil((period.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  const isLast = index === futurePeriods.slice(0, 3).length - 1;
                  
                  return (
                    <View key={index} style={[
                      styles.predictionInfoItem,
                      isLast && styles.predictionInfoItemLast
                    ]}>
                      <Text style={styles.predictionInfoLabel}>
                        {period.toLocaleDateString('en-US', { 
                          weekday: 'short', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </Text>
                      <Text style={styles.predictionInfoValue}>
                        {daysUntil > 0 ? `${daysUntil} days` : 'Today'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
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
  calendarContainer: {
    marginHorizontal: 20,
    height: 320,
    overflow: 'hidden',
  },
  calendar: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 15,
    elevation: 2,
    shadowColor: theme.colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    height: 320,
  },
  nextMonthCalendar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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
  predictionInfo: {
    gap: 0,
  },
  predictionInfoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  predictionInfoItemLast: {
    borderBottomWidth: 0,
  },
  predictionInfoLabel: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  predictionInfoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.primary,
  },
});