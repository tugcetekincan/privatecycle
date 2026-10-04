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
  Modal,
} from 'react-native';
import { Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight, X, Check, Droplets } from 'lucide-react-native';
import { DataService, DailyData } from '@/services/DataService';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@/hooks/useTheme';
import { useDialog } from '@/hooks/useDialog';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const FLOW_LEVELS = [
  { id: 'light', label: 'Light', color: '#ffcccb' },
  { id: 'medium', label: 'Medium', color: '#ff6b6b' },
  { id: 'heavy', label: 'Heavy', color: '#dc143c' },
];

const SYMPTOMS = [
  { id: 'cramps', label: 'Cramps', icon: '😣' },
  { id: 'headache', label: 'Headache', icon: '🤕' },
  { id: 'bloating', label: 'Bloating', icon: '😵' },
  { id: 'mood', label: 'Mood Changes', icon: '😢' },
  { id: 'fatigue', label: 'Fatigue', icon: '😴' },
  { id: 'backache', label: 'Back Pain', icon: '😖' },
  { id: 'breastache', label: 'Breast Pain', icon: '🤱' },
];

const MOODS = [
  { id: 'happy', label: 'Happy', icon: '😊', color: '#4caf50' },
  { id: 'sad', label: 'Sad', icon: '😢', color: '#2196f3' },
  { id: 'anxious', label: 'Anxious', icon: '😰', color: '#ff9800' },
  { id: 'calm', label: 'Calm', icon: '😌', color: '#9c27b0' },
  { id: 'irritated', label: 'Irritated', icon: '😤', color: '#f44336' },
];

const { width: screenWidth } = Dimensions.get('window');

export default function CalendarTab() {
  const { theme } = useTheme();
  const { showSuccess, showError, DialogComponent } = useDialog();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [periodDates, setPeriodDates] = useState<string[]>([]);
  const [noPeriodDates, setNoPeriodDates] = useState<string[]>([]);
  const [nextPeriod, setNextPeriod] = useState<Date | null>(null);
  const [futurePeriods, setFuturePeriods] = useState<Date[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [allDailyData, setAllDailyData] = useState<{ [date: string]: DailyData }>({});
  const [calendarHeight, setCalendarHeight] = useState(220);
  
  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDateData, setSelectedDateData] = useState<{
    date: Date;
    data: DailyData | null;
  } | null>(null);
  const [editingData, setEditingData] = useState<DailyData | null>(null);
  
  const slideAnim = useRef(new Animated.Value(0)).current;
  const nextMonthAnim = useRef(new Animated.Value(screenWidth)).current;
  const heightAnim = useRef(new Animated.Value(220)).current;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const newHeight = getCalendarHeight(currentDate);
    setCalendarHeight(newHeight);
    heightAnim.setValue(newHeight);
  }, [currentDate]);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    const data = await DataService.getPeriodData();
    const dailyData = await DataService.getAllDailyData();
    setAllDailyData(dailyData);
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
          // Add deterministic variability to predictions beyond the first one
          // Use a seeded approach based on the last period date and prediction index
          let adjustment = 0;
          if (i > 1) {
            const seed = lastPeriodStart.getTime() + i;
            const pseudoRandom = (Math.sin(seed) + 1) / 2; // Normalize to 0-1
            adjustment = Math.round((pseudoRandom - 0.5) * cycleVariability * 0.5);
          }
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

  const hasDataForDate = (date: Date): boolean => {
    const dateKey = formatDateKey(date);
    const data = allDailyData[dateKey];
    // Only consider it as having data if it has meaningful content
    return data && (
      data.isPeriod || 
      data.symptoms.length > 0 || 
      data.mood !== '' || 
      data.flowLevel !== ''
    );
  };

  const handleDayPress = async (date: Date) => {
    const dateKey = formatDateKey(date);
    const existingData = allDailyData[dateKey] || null;
    
    setSelectedDateData({ date, data: existingData });
    setEditingData(existingData || {
      date: dateKey,
      isPeriod: false,
      flowLevel: '',
      symptoms: [],
      mood: '',
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedDateData(null);
    setEditingData(null);
  };

  const saveModalData = async () => {
    if (!editingData || !selectedDateData) return;

    try {
      await DataService.saveTodayData(editingData.date, editingData);
      await loadData(); // Reload all data to update the calendar
      closeModal();
      showSuccess('Success', 'Data saved successfully!');
    } catch (error) {
      showError('Error', 'Failed to save data. Please try again.');
      console.error('Error saving data:', error);
    }
  };

  const toggleModalSymptom = (symptomId: string) => {
    if (!editingData) return;
    
    setEditingData({
      ...editingData,
      symptoms: editingData.symptoms.includes(symptomId)
        ? editingData.symptoms.filter(id => id !== symptomId)
        : [...editingData.symptoms, symptomId]
    });
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
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return firstDay === 0 ? 6 : firstDay - 1;
  };

  const getCalendarRows = (date: Date) => {
    const daysInMonth = getDaysInMonth(date);
    const firstDay = getFirstDayOfMonth(date);
    const totalCells = firstDay + daysInMonth;
    return Math.ceil(totalCells / 7);
  };

  const getCalendarHeight = (date: Date) => {
    const rows = getCalendarRows(date);
    const dayRowHeight = 36;
    const headerHeight = 30;
    const padding = 20;
    return headerHeight + (rows * dayRowHeight) + padding;
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
        return { borderRadius: 18 };
      case 'start':
        return { borderTopLeftRadius: 18, borderBottomLeftRadius: 18, borderTopRightRadius: 0, borderBottomRightRadius: 0 };
      case 'middle':
        return { borderRadius: 0 };
      case 'end':
        return { borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderTopRightRadius: 18, borderBottomRightRadius: 18 };
      default:
        return { borderRadius: 18 };
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
    
    const targetHeight = getCalendarHeight(targetDate);
    
    setIsAnimating(true);
    setAnimationDirection(direction);
    setNextMonthDate(targetDate);
    
    const slideOutDistance = direction === 'next' ? -screenWidth : screenWidth;
    const slideInStartDistance = direction === 'next' ? screenWidth : -screenWidth;
    
    // Reset next month position
    nextMonthAnim.setValue(slideInStartDistance);
    
    // Animate current month out, next month in, and height change
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
      Animated.timing(heightAnim, {
        toValue: targetHeight,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start(() => {
      // Update the current date to the target date
      setCurrentDate(targetDate);
      setCalendarHeight(targetHeight);
      
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

      const hasData = hasDataForDate(dayDate);
      
      // Allow clicking on any day, not just ones with data
      const DayComponent = TouchableOpacity;
      
      days.push(
        <DayComponent
          key={day}
          testID={`calendar-day-${formatDateKey(dayDate)}`}
          style={[
            styles.dayCell,
            isToday && styles.today,
            isPeriod && [styles.periodDay, periodBorderRadius],
            isNoPeriod && [styles.noPeriodDay, noPeriodBorderRadius],
            isPredicted && [styles.predictedDay, predictedBorderRadius],
            hasData && styles.clickableDay,
          ]}
          onPress={() => handleDayPress(dayDate)}
          activeOpacity={0.7}>
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
          {isToday && (
            <View style={styles.todayIndicator} />
          )}
        </DayComponent>
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
          <TouchableOpacity testID="calendar-prev-month" onPress={() => navigateMonth('prev')}>
            <ChevronLeft size={24} color={theme.colors.primary} />
          </TouchableOpacity>
          <Text testID="calendar-month-label" style={styles.monthYear}>
            {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
          </Text>
          <TouchableOpacity testID="calendar-next-month" onPress={() => navigateMonth('next')}>
            <ChevronRight size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Calendar */}
        <Animated.View style={[styles.calendarContainer, { height: heightAnim }]} {...panResponder.panHandlers}>
          {/* Current Month */}
          <Animated.View style={[
            styles.calendar,
            { height: calendarHeight },
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
              { height: getCalendarHeight(nextMonthDate) },
              {
                transform: [{ translateX: nextMonthAnim }],
              },
            ]}>
              {renderCalendarContent(nextMonthDate)}
            </Animated.View>
          )}
        </Animated.View>

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

      {/* Day Details Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View testID="day-modal" style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedDateData?.date.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </Text>
              <TouchableOpacity testID="day-modal-close" onPress={closeModal} style={styles.closeButton}>
                <X size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView}>
              {/* Period Tracking */}
              <View style={styles.modalCard}>
                <Text style={styles.modalCardTitle}>Period</Text>
                <TouchableOpacity 
                  testID="day-modal-period-toggle"
                  style={[styles.periodButton, editingData?.isPeriod && styles.periodButtonActive]}
                  onPress={() => editingData && setEditingData({
                    ...editingData,
                    isPeriod: !editingData.isPeriod,
                    flowLevel: !editingData.isPeriod ? editingData.flowLevel : '',
                  })}>
                  <Droplets size={20} color={editingData?.isPeriod ? theme.colors.white : '#e91e63'} />
                  <Text style={[styles.periodButtonText, editingData?.isPeriod && styles.periodButtonTextActive]}>
                    {editingData?.isPeriod ? 'Period Day' : 'No Period'}
                  </Text>
                </TouchableOpacity>

                {/* Flow Level */}
                {editingData?.isPeriod && (
                  <View style={styles.flowSection}>
                    <Text style={styles.flowSectionTitle}>Flow Level</Text>
                    <View style={styles.flowButtons}>
                      {FLOW_LEVELS.map(level => (
                        <TouchableOpacity
                          key={level.id}
                          testID={`day-modal-flow-${level.id}`}
                          style={[
                            styles.flowButton,
                            { backgroundColor: level.color },
                            editingData.flowLevel === level.id && styles.flowButtonActive
                          ]}
                          onPress={() => setEditingData({
                            ...editingData,
                            flowLevel: level.id,
                          })}>
                          <Text style={[
                            styles.flowButtonText,
                            editingData.flowLevel === level.id && styles.flowButtonTextActive
                          ]}>
                            {level.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>

              {/* Symptoms */}
              <View style={styles.modalCard}>
                <Text style={styles.modalCardTitle}>Symptoms</Text>
                <View style={styles.symptomsGrid}>
                  {SYMPTOMS.map(symptom => (
                    <TouchableOpacity
                      key={symptom.id}
                      testID={`day-modal-symptom-${symptom.id}`}
                      style={[
                        styles.symptomChip,
                        editingData?.symptoms.includes(symptom.id) && styles.symptomChipSelected,
                      ]}
                      onPress={() => toggleModalSymptom(symptom.id)}>
                      <Text style={styles.symptomEmoji}>{symptom.icon}</Text>
                      <Text style={[
                        styles.symptomText,
                        editingData?.symptoms.includes(symptom.id) && styles.symptomTextSelected,
                      ]}>
                        {symptom.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Mood */}
              <View style={styles.modalCard}>
                <Text style={styles.modalCardTitle}>Mood</Text>
                <View style={styles.moodGrid}>
                  {MOODS.map(mood => (
                    <TouchableOpacity
                      key={mood.id}
                      testID={`day-modal-mood-${mood.id}`}
                      style={[
                        styles.moodChip,
                        editingData?.mood === mood.id && [
                          styles.moodChipSelected,
                          { backgroundColor: mood.color },
                        ],
                      ]}
                      onPress={() => editingData && setEditingData({
                        ...editingData,
                        mood: editingData.mood === mood.id ? '' : mood.id,
                      })}>
                      <Text style={styles.moodEmoji}>{mood.icon}</Text>
                      <Text style={[
                        styles.moodText,
                        editingData?.mood === mood.id && styles.moodTextSelected,
                      ]}>
                        {mood.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                testID="day-modal-save"
                style={styles.saveButton}
                onPress={saveModalData}>
                <Check size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <DialogComponent />
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
    paddingVertical: 10,
  },
  monthYear: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
  },
  calendarContainer: {
    marginHorizontal: 15,
    overflow: 'hidden',
  },
  calendar: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 10,
    elevation: 2,
    shadowColor: theme.colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
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
    paddingBottom: 8,
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
    paddingTop: 8,
  },
  emptyDay: {
    width: '14.28%',
    height: 36,
  },
  dayCell: {
    width: '14.28%',
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayText: {
    fontSize: 16,
    color: theme.colors.text,
  },
  today: {
    backgroundColor: theme.colors.accent,
    borderRadius: 18,
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
  },
  noPeriodText: {
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  predictedDay: {
    backgroundColor: theme.isDark ? '#8e24aa' : '#ffb3d1',
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
    paddingVertical: 15,
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
  clickableDay: {
    opacity: 0.9,
  },
  todayIndicator: {
    position: 'absolute',
    bottom: 2,
    left: '50%',
    marginLeft: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.accent,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '80%',
    paddingBottom: 20,
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
  closeButton: {
    padding: 5,
  },
  modalScrollView: {
    flex: 1,
    paddingBottom: 20,
  },
  modalCard: {
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
  modalCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 15,
  },
  periodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e91e63',
  },
  periodButtonActive: {
    backgroundColor: '#e91e63',
  },
  periodButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#e91e63',
    marginLeft: 8,
  },
  periodButtonTextActive: {
    color: '#fff',
  },
  flowSection: {
    marginTop: 20,
  },
  flowSectionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    marginBottom: 10,
  },
  flowButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  flowButton: {
    flex: 1,
    padding: 12,
    marginHorizontal: 5,
    borderRadius: 8,
    alignItems: 'center',
    opacity: 0.7,
  },
  flowButtonActive: {
    opacity: 1,
    borderWidth: 2,
    borderColor: theme.colors.text,
  },
  flowButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  },
  flowButtonTextActive: {
    fontWeight: '600',
  },
  symptomsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  symptomChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.secondary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginBottom: 8,
  },
  symptomChipSelected: {
    backgroundColor: theme.colors.primary,
  },
  symptomEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  symptomText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  symptomTextSelected: {
    color: theme.colors.white,
    fontWeight: '500',
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  moodChip: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: theme.colors.secondary,
    margin: 5,
    minWidth: 70,
  },
  moodChipSelected: {
    backgroundColor: theme.colors.primary,
  },
  moodEmoji: {
    fontSize: 24,
    marginBottom: 5,
  },
  moodText: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.text,
  },
  moodTextSelected: {
    color: theme.colors.white,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
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
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.white,
  },
});