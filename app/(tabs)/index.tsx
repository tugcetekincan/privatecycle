import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  PanResponder,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check, Droplets, Egg } from 'lucide-react-native';
import { DataService, DailyData } from '@/services/DataService';
import { NotificationService } from '@/services/NotificationService';
import { FertilityForecast } from '@/services/FertilityService';
import { addDays, daysBetween, isAfterToday, parseDateKey } from '@/services/dateKey';
import { MoodValue, primaryMoodId } from '@/services/MoodTags';
import { SYMPTOMS } from '@/services/Symptoms';
import MoodPicker from '@/components/MoodPicker';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import ScreenHeader from '@/components/ui/ScreenHeader';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card } from '@/components/ui/Card';
import PrimaryButton from '@/components/ui/PrimaryButton';
import ScreenFade from '@/components/ui/ScreenFade';
import Sheet from '@/components/ui/Sheet';
import EmptyState from '@/components/ui/EmptyState';
import { cardShadow, radii, spacing, typography } from '@/design/tokens';
import { useDialog } from '@/hooks/useDialog';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const FLOW_LEVELS = [
  { id: 'light', label: 'Light', color: '#ffcccb' },
  { id: 'medium', label: 'Medium', color: '#ff6b6b' },
  { id: 'heavy', label: 'Heavy', color: '#dc143c' },
];

// Intentional accent for ovulation marks; keeps them distinct from period pink.
const OVULATION_COLOR = '#009688';

// A predicted period span covers seven days from its start, as before.
const PREDICTED_PERIOD_DAYS = 7;

// Fertile window convention: five days before ovulation + ovulation day.
const FERTILE_WINDOW_DAYS_BEFORE = 5;

export default function CalendarTab() {
  const { theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const { showSuccess, showInfo, DialogComponent } = useDialog();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [periodDates, setPeriodDates] = useState<string[]>([]);
  const [noPeriodDates, setNoPeriodDates] = useState<string[]>([]);
  const [ovulationDates, setOvulationDates] = useState<string[]>([]);
  const [futurePeriods, setFuturePeriods] = useState<string[]>([]);
  const [predictedPeriodKeys, setPredictedPeriodKeys] = useState<Set<string>>(new Set());
  const [fertileWindowKeys, setFertileWindowKeys] = useState<Set<string>>(new Set());
  const [predictedOvulationKeys, setPredictedOvulationKeys] = useState<Set<string>>(new Set());
  const [forecast, setForecast] = useState<FertilityForecast | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [allDailyData, setAllDailyData] = useState<{ [date: string]: DailyData }>({});
  const [calendarHeight, setCalendarHeight] = useState(252);
  
  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDateData, setSelectedDateData] = useState<{
    date: Date;
    data: DailyData | null;
  } | null>(null);
  const [editingData, setEditingData] = useState<DailyData | null>(null);
  const [moodSaved, setMoodSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const moodSaveQueue = useRef(Promise.resolve());
  const moodSaveRevision = useRef(0);
  const moodSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const slideAnim = useRef(new Animated.Value(0)).current;
  const nextMonthAnim = useRef(new Animated.Value(screenWidth)).current;
  const heightAnim = useRef(new Animated.Value(252)).current;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(
    () => () => {
      moodSaveRevision.current += 1;
      if (moodSavedTimer.current) clearTimeout(moodSavedTimer.current);
    },
    []
  );

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
    const fertility = await DataService.getFertilityForecast();

    setAllDailyData(dailyData);
    setPeriodDates(data.periods);
    setOvulationDates(data.ovulationDays);
    setForecast(fertility);
    setFuturePeriods(fertility.futurePeriodStarts);

    // Get dates where user explicitly marked "no period"
    const noPeriodDates = Object.entries(dailyData)
      .filter(([_, dayData]) => !dayData.isPeriod)
      .map(([date, _]) => date);
    setNoPeriodDates(noPeriodDates);

    // Predicted period days: seven days from each predicted start.
    const predictedPeriodKeys = new Set<string>();
    for (const start of fertility.futurePeriodStarts) {
      const startDate = parseDateKey(start);
      for (let offset = 0; offset < PREDICTED_PERIOD_DAYS; offset++) {
        predictedPeriodKeys.add(formatDateKey(addDays(startDate, offset)));
      }
    }
    setPredictedPeriodKeys(predictedPeriodKeys);

    // Predicted fertile window / ovulation days; the service already omits
    // cycles whose window has passed and cycles with a recorded ovulation.
    const todayKey = formatDateKey(new Date());
    const ovulationKeys = new Set<string>();
    const windowKeys = new Set<string>();
    for (const cycle of fertility.cycles) {
      ovulationKeys.add(cycle.ovulationDate);
      const windowStart = parseDateKey(cycle.windowStart);
      for (let offset = 0; offset <= FERTILE_WINDOW_DAYS_BEFORE; offset++) {
        const key = formatDateKey(addDays(windowStart, offset));
        if (key >= todayKey) windowKeys.add(key);
      }
    }
    setPredictedOvulationKeys(ovulationKeys);
    setFertileWindowKeys(windowKeys);
  };

  const hasDataForDate = (date: Date): boolean => {
    const dateKey = formatDateKey(date);
    const data = allDailyData[dateKey];
    // Only consider it as having data if it has meaningful content
    return data && (
      data.isPeriod || 
      data.isOvulation ||
      data.symptoms.length > 0 || 
      data.mood !== '' || 
      data.flowLevel !== ''
    );
  };

  const handleDayPress = async (date: Date) => {
    if (isAfterToday(date)) {
      showInfo('Future date', 'You can only log data for today or earlier.');
      return;
    }

    const dateKey = formatDateKey(date);
    const existingData = allDailyData[dateKey] || null;
    moodSaveRevision.current += 1;
    if (moodSavedTimer.current) clearTimeout(moodSavedTimer.current);
    setSaveError('');
    setMoodSaved(false);
    
    setSelectedDateData({ date, data: existingData });
    setEditingData(existingData || {
      date: dateKey,
      isPeriod: false,
      flowLevel: '',
      symptoms: [],
      mood: '',
      isOvulation: false,
      moodValence: 0,
      moodTags: [],
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    if (saving) return;
    moodSaveRevision.current += 1;
    if (moodSavedTimer.current) clearTimeout(moodSavedTimer.current);
    setModalVisible(false);
    setSelectedDateData(null);
    setEditingData(null);
  };

  const saveModalData = async () => {
    if (!editingData || !selectedDateData || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await moodSaveQueue.current;
      await DataService.saveTodayData(editingData.date, editingData);
      await loadData(); // Reload all data to update the calendar
      void NotificationService.syncSchedule();
      setModalVisible(false);
      setSelectedDateData(null);
      setEditingData(null);
      // Let the native sheet finish dismissing before presenting the dialog,
      // otherwise the dialog can appear behind the closing modal.
      setTimeout(() => showSuccess('Day saved', 'Your calendar is up to date.'), 350);
    } catch (error) {
      setSaveError('Could not save this day. Please try again.');
    } finally {
      setSaving(false);
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

  // Mood auto-saves on every tap, while the rest of the modal still goes
  // through the explicit Save button.
  const handleModalMoodChange = async (next: MoodValue) => {
    if (!editingData || saving) return;
    const dateKey = editingData.date;
    const revision = ++moodSaveRevision.current;

    setEditingData({
      ...editingData,
      mood: primaryMoodId(next.tags),
      moodValence: next.valence,
      moodTags: next.tags,
    });
    setMoodSaved(false);
    if (moodSavedTimer.current) clearTimeout(moodSavedTimer.current);
    const save = moodSaveQueue.current.then(async () => {
      await DataService.saveMoodData(dateKey, {
        mood: primaryMoodId(next.tags),
        moodValence: next.valence,
        moodTags: next.tags,
      });
      // Clearing a mood can remove the day's row entirely; reload so the
      // calendar's day marks are up to date when the modal closes.
      await loadData();
      void NotificationService.syncSchedule();
      // Only acknowledge the latest selection in the still-open entry.
      if (revision !== moodSaveRevision.current) return;
      setMoodSaved(true);
      setSaveError('');
      if (moodSavedTimer.current) clearTimeout(moodSavedTimer.current);
      moodSavedTimer.current = setTimeout(() => setMoodSaved(false), 2000);
    });
    moodSaveQueue.current = save.catch(() => {
      if (revision !== moodSaveRevision.current) return;
      setMoodSaved(false);
      setSaveError('Mood could not be saved. Tap Save day to try again.');
    });
    await moodSaveQueue.current;
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
    const dayRowHeight = 44;
    const headerHeight = 26;
    const padding = 6;
    return headerHeight + rows * dayRowHeight + padding;
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

  const isOvulationDay = (date: Date) => {
    return ovulationDates.includes(formatDateKey(date));
  };

  const isPredictedPeriod = (date: Date) => {
    return predictedPeriodKeys.has(formatDateKey(date));
  };

  const isPredictedOvulationDay = (date: Date) => {
    return predictedOvulationKeys.has(formatDateKey(date));
  };

  const isFertileWindowDay = (date: Date) => {
    return fertileWindowKeys.has(formatDateKey(date));
  };

  const formatPredictionDate = (dateKey: string) => {
    return parseDateKey(dateKey).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatShortDate = (dateKey: string) => {
    return parseDateKey(dateKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const daysUntilLabel = (dateKey: string) => {
    const days = daysBetween(parseDateKey(formatDateKey(new Date())), parseDateKey(dateKey));
    if (days <= 0) return 'Today';
    return days === 1 ? 'in 1 day' : `in ${days} days`;
  };

  const getOvulationHint = (date: Date): string | null => {
    const key = formatDateKey(date);
    if (predictedOvulationKeys.has(key)) return 'Predicted ovulation day';
    if (fertileWindowKeys.has(key)) return 'Within the predicted fertile window';
    return null;
  };

  const [nextMonthDate, setNextMonthDate] = useState<Date | null>(null);

  const navigateMonth = (direction: 'prev' | 'next') => {
    if (isAnimating) return;
    
    // Calculate the target date before starting animation
    const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + (direction === 'prev' ? -1 : 1), 1);
    if (reducedMotion) {
      setCurrentDate(targetDate);
      return;
    }
    
    const targetHeight = getCalendarHeight(targetDate);
    
    setIsAnimating(true);
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
      const dayKey = formatDateKey(dayDate);
      const isToday = dayKey === formatDateKey(new Date());
      const isPeriod = isPeriodDay(dayDate);
      const isNoPeriod = isNoPeriodDay(dayDate);
      const isPredicted = isPredictedPeriod(dayDate);
      const isOvulation = isOvulationDay(dayDate);
      const isPredictedOvulation = !isOvulation && isPredictedOvulationDay(dayDate);
      const isFertile = isFertileWindowDay(dayDate);
      const hasData = hasDataForDate(dayDate);

      const DayComponent = TouchableOpacity;

      days.push(
        <DayComponent
          key={day}
          testID={`calendar-day-${dayKey}`}
          accessibilityRole="button"
          accessibilityLabel={`${dayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${isToday ? ', today' : ''}${isPeriod ? ', period' : isPredicted ? ', predicted period' : ''}${isOvulation ? ', ovulation recorded' : isFertile ? ', estimated fertile window' : ''}${isNoPeriod ? ', entry logged' : ''}`}
          style={[styles.dayCell, hasData && styles.clickableDay]}
          onPress={() => handleDayPress(dayDate)}
          activeOpacity={0.7}>
          <View
            style={[
              styles.dayInner,
              isPredicted && styles.predictedDay,
              isFertile && styles.fertileWindowDay,
              isPeriod && styles.periodDay,
            ]}>
            {isToday && (
              <View testID={`calendar-today-${dayKey}`} style={styles.todayMarker} />
            )}
            <Text
              style={[
                styles.dayText,
                isPeriod && styles.periodText,
                isNoPeriod && styles.noPeriodText,
                isPredicted && styles.predictedText,
                isToday && !isPeriod && styles.todayText,
              ]}>
              {day}
            </Text>
            {isOvulation && (
              <View
                testID={`calendar-ovulation-recorded-${dayKey}`}
                style={styles.ovulationDot}
              />
            )}
            {isPredictedOvulation && (
              <View
                testID={`calendar-ovulation-predicted-${dayKey}`}
                style={[styles.ovulationDot, styles.ovulationDotPredicted]}
              />
            )}
            {isNoPeriod && !isFertile && !isOvulation && (
              <View
                testID={`calendar-day-mark-${dayKey}`}
                style={styles.noPeriodDot}
              />
            )}
          </View>
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

  const currentCycleOvulation = forecast?.currentCycleOvulation ?? null;
  const recordedOvulationDays =
    forecast?.ovulationDays.filter((day) => day <= formatDateKey(new Date())) ?? [];
  const lastRecordedOvulation = recordedOvulationDays.length
    ? recordedOvulationDays[recordedOvulationDays.length - 1]
    : null;
  // The grid marks every recorded ovulation; show the same latest mark in the
  // card when the open cycle has no record of its own.
  const recordedOvulation = currentCycleOvulation ?? lastRecordedOvulation;
  const recordedOvulationLabel = currentCycleOvulation
    ? 'Recorded ovulation'
    : 'Last recorded ovulation';
  const nextCycleForecast = forecast?.cycles[0] ?? null;
  const now = new Date();
  const isViewingCurrentMonth =
    currentDate.getFullYear() === now.getFullYear() &&
    currentDate.getMonth() === now.getMonth();

  return (
    <View style={styles.container}>
      <ScreenFade>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <ScreenHeader
            title="Period Calendar"
            subtitle="Tap a day to log or edit"
            icon={<CalendarIcon size={21} color={theme.colors.primary} />}
          />
          {forecast && Object.keys(allDailyData).length === 0 && (
            <Card testID="calendar-welcome" style={{ marginHorizontal: spacing.xxl, marginBottom: spacing.base }}>
              <EmptyState plain title="Your journal starts here" body="Log a period, a feeling, or a symptom. A little at a time, your own patterns will take shape." />
              <PrimaryButton testID="calendar-log-today" title="Log today" onPress={() => handleDayPress(new Date())} />
            </Card>
          )}

          <View style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                testID="calendar-prev-month"
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                style={styles.monthButton}
                onPress={() => navigateMonth('prev')}>
                <ChevronLeft size={19} color={theme.colors.primary} />
              </TouchableOpacity>
              <Text testID="calendar-month-label" style={[typography.cardTitle, styles.monthYear]}>
                {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
              </Text>
              <TouchableOpacity
                testID="calendar-next-month"
                accessibilityRole="button"
                accessibilityLabel="Next month"
                style={styles.monthButton}
                onPress={() => navigateMonth('next')}>
                <ChevronRight size={19} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>

            {isViewingCurrentMonth && (
              <Text testID="calendar-today-caption" style={[typography.micro, styles.todayCaption]}>
                <Text style={styles.todayCaptionLabel}>TODAY</Text>
                {' · '}
                {now
                  .toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })
                  .toUpperCase()}
              </Text>
            )}
            {!isViewingCurrentMonth && (
              <TouchableOpacity testID="calendar-return-today" accessibilityRole="button" onPress={() => !isAnimating && setCurrentDate(new Date())} style={styles.returnToday}>
                <Text style={[typography.caption, { color: theme.colors.today }]}>Back to today</Text>
              </TouchableOpacity>
            )}

            <Animated.View
              style={[styles.calendarViewport, { height: heightAnim }]}
              {...panResponder.panHandlers}>
              <Animated.View
                style={[
                  styles.calendar,
                  { height: calendarHeight },
                  { transform: [{ translateX: slideAnim }] },
                ]}>
                {renderCalendarContent(currentDate)}
              </Animated.View>

              {isAnimating && nextMonthDate && (
                <Animated.View
                  style={[
                    styles.calendar,
                    styles.nextMonthCalendar,
                    { height: getCalendarHeight(nextMonthDate) },
                    { transform: [{ translateX: nextMonthAnim }] },
                  ]}>
                  {renderCalendarContent(nextMonthDate)}
                </Animated.View>
              )}
            </Animated.View>

            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.colors.primary }]} />
                <Text style={styles.legendText}>Period</Text>
              </View>
              <View style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: theme.isDark ? '#666666' : '#c9c9c9' },
                  ]}
                />
                <Text style={styles.legendText}>No Period</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.colors.primaryWeak }]} />
                <Text style={styles.legendText}>Predicted</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: OVULATION_COLOR }]} />
                <Text style={styles.legendText}>Ovulation</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.colors.tealSoft }]} />
                <Text style={styles.legendText}>Fertile window</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendTodayDot]} />
                <Text style={styles.legendText}>Today</Text>
              </View>
            </View>
          </View>

          {futurePeriods.length > 0 && (
            <>
              <SectionHeader
                title="UPCOMING PERIODS"
                meta="Next 3"
                dotColor={theme.colors.primary}
              />
              <Card style={styles.sectionCard} padding={14}>
                <View style={styles.predictionInfo}>
                  {futurePeriods.slice(0, 3).map((periodStart, index, shown) => {
                    const isLast = index === shown.length - 1;
                    return (
                      <View
                        key={periodStart}
                        style={[
                          styles.predictionInfoItem,
                          isLast && styles.predictionInfoItemLast,
                        ]}>
                        <Text style={styles.predictionInfoLabel}>
                          {formatPredictionDate(periodStart)}
                        </Text>
                        <Text style={styles.predictionInfoValue}>
                          {daysUntilLabel(periodStart)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
            </>
          )}

          <SectionHeader
            title="FERTILITY FORECAST"
            meta="Wellness estimate"
            dotColor={OVULATION_COLOR}
          />
          <Card style={styles.sectionCard} padding={14} testID="calendar-fertility-card">
            {recordedOvulation || nextCycleForecast ? (
              <View style={styles.predictionInfo}>
                {recordedOvulation && (
                  <View
                    style={[
                      styles.predictionInfoItem,
                      !nextCycleForecast && styles.predictionInfoItemLast,
                    ]}>
                    <Text style={styles.predictionInfoLabel}>{recordedOvulationLabel}</Text>
                    <Text testID="calendar-recorded-ovulation" style={styles.fertilityValue}>
                      {formatShortDate(recordedOvulation)}
                    </Text>
                  </View>
                )}
                {nextCycleForecast && (
                  <>
                    <View style={styles.predictionInfoItem}>
                      <Text style={styles.predictionInfoLabel}>
                        {nextCycleForecast.isCurrentCycle
                          ? 'Ovulation expected'
                          : 'Next ovulation'}
                      </Text>
                      <Text testID="calendar-next-ovulation" style={styles.fertilityValue}>
                        {formatShortDate(nextCycleForecast.ovulationDate)} ·{' '}
                        {daysUntilLabel(nextCycleForecast.ovulationDate)}
                      </Text>
                    </View>
                    <View style={[styles.predictionInfoItem, styles.predictionInfoItemLast]}>
                      <Text style={styles.predictionInfoLabel}>Fertile window</Text>
                      <Text testID="calendar-fertile-window" style={styles.fertilityValue}>
                        {formatShortDate(nextCycleForecast.windowStart)} –{' '}
                        {formatShortDate(nextCycleForecast.windowEnd)}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            ) : (
              <Text testID="calendar-fertility-empty" style={styles.fertilityEmpty}>
                {forecast && forecast.futurePeriodStarts.length === 0
                  ? 'Track a period to see fertility forecasts!'
                  : 'No upcoming fertile window right now.'}
              </Text>
            )}
            {nextCycleForecast && (
              <Text style={styles.fertilityNote}>
                {forecast?.stats.basis === 'recorded'
                  ? 'Personalized from your recorded cycles'
                  : 'Estimated from a standard cycle'}
                {' · wellness estimate, not a contraceptive method'}
              </Text>
            )}
          </Card>
        </ScrollView>
      </ScreenFade>

      {/* Day Details Modal */}
      <Sheet
        visible={modalVisible}
        onClose={closeModal}
        testID="day-modal"
        closeTestID="day-modal-close"
        title={selectedDateData?.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) ?? 'Daily entry'}
        subtitle="Mood saves as you go · Save your other changes below"
        footer={<>
          {saveError ? <Text accessibilityRole="alert" style={{ color: theme.colors.error, marginBottom: spacing.sm }}>{saveError}</Text> : null}
          <PrimaryButton testID="day-modal-save" title={saving ? 'Saving…' : 'Save day'} loading={saving} onPress={saveModalData} icon={<Check size={18} color={theme.colors.white} />} />
        </>}>
              {/* Mood (auto-saves on every tap) */}
              <MoodPicker
                valence={editingData?.moodValence || 0}
                tags={editingData?.moodTags || []}
                saved={moodSaved}
                onChange={handleModalMoodChange}
                testIDPrefix="day-modal-mood"
                compact
              />

              {/* Period Tracking */}
              <Card style={styles.modalCard} padding={16}>
                <Text style={styles.modalCardTitle}>Period</Text>
                <TouchableOpacity 
                  testID="day-modal-period-toggle"
                  accessibilityRole="switch"
                  accessibilityState={{ checked: Boolean(editingData?.isPeriod) }}
                  accessibilityLabel="Period day"
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
                          accessibilityRole="radio"
                          accessibilityState={{ checked: editingData.flowLevel === level.id }}
                          style={[
                            styles.flowButton,
                            editingData.flowLevel === level.id && styles.flowButtonActive
                          ]}
                          onPress={() => setEditingData({
                            ...editingData,
                            flowLevel: editingData.flowLevel === level.id ? '' : level.id,
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
              </Card>

              {/* Ovulation */}
              <Card style={styles.modalCard} padding={16}>
                <Text style={styles.modalCardTitle}>Ovulation</Text>
                <TouchableOpacity
                  testID="day-modal-ovulation-toggle"
                  accessibilityRole="switch"
                  accessibilityLabel="Ovulation recorded"
                  accessibilityState={{ checked: Boolean(editingData?.isOvulation) }}
                  style={[styles.ovulationButton, editingData?.isOvulation && styles.ovulationButtonActive]}
                  onPress={() => editingData && setEditingData({
                    ...editingData,
                    isOvulation: !editingData.isOvulation,
                  })}>
                  <Egg size={20} color={editingData?.isOvulation ? theme.colors.white : OVULATION_COLOR} />
                  <Text style={[styles.ovulationButtonText, editingData?.isOvulation && styles.ovulationButtonTextActive]}>
                    {editingData?.isOvulation ? 'Ovulation Day' : 'No Ovulation'}
                  </Text>
                </TouchableOpacity>
                {!editingData?.isOvulation && selectedDateData && getOvulationHint(selectedDateData.date) && (
                  <Text testID="day-modal-ovulation-hint" style={styles.ovulationHint}>
                    {getOvulationHint(selectedDateData.date)}
                  </Text>
                )}
              </Card>

              {/* Symptoms */}
              <Card style={styles.modalCard} padding={16}>
                <Text style={styles.modalCardTitle}>Symptoms</Text>
                <View style={styles.symptomsGrid}>
                  {SYMPTOMS.map(symptom => (
                    <TouchableOpacity
                      key={symptom.id}
                      testID={`day-modal-symptom-${symptom.id}`}
                      accessibilityRole="checkbox"
                      accessibilityLabel={symptom.label}
                      accessibilityState={{ checked: Boolean(editingData?.symptoms.includes(symptom.id)) }}
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
              </Card>
      </Sheet>
      <DialogComponent />
    </View>
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
  scrollContent: {
    paddingBottom: 24,
  },
  calendarCard: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: 20,
    marginTop: 2,
    padding: 14,
    borderRadius: radii.hero,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...cardShadow(theme),
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  monthButton: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: theme.colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthYear: {
    color: theme.colors.text,
    flexShrink: 1,
    textAlign: 'center',
  },
  returnToday: { minHeight: 44, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  todayCaption: {
    alignSelf: 'center',
    overflow: 'hidden',
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: theme.colors.today,
    backgroundColor: theme.colors.todaySoft,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  todayCaptionLabel: {
    color: theme.colors.today,
    fontWeight: '800',
  },
  calendarViewport: {
    overflow: 'hidden',
  },
  calendar: {
    backgroundColor: 'transparent',
  },
  nextMonthCalendar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  dayHeaders: {
    flexDirection: 'row',
    paddingBottom: 7,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dayHeader: {
    flex: 1,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: 3,
  },
  emptyDay: {
    width: '14.2857%',
    height: 44,
  },
  dayCell: {
    width: '14.2857%',
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayInner: {
    width: 34,
    height: 34,
    borderRadius: radii.day,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  todayMarker: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 34,
    height: 34,
    borderRadius: radii.day,
    borderWidth: 2,
    borderColor: theme.colors.today,
    backgroundColor: 'transparent',
  },
  todayText: {
    color: theme.colors.today,
    fontWeight: '800',
  },
  periodDay: {
    backgroundColor: theme.colors.primary,
  },
  periodText: {
    color: theme.colors.white,
    fontWeight: '800',
  },
  noPeriodText: {
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  noPeriodDot: {
    position: 'absolute',
    bottom: 4,
    right: 5,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.isDark ? '#666666' : '#c9c9c9',
  },
  predictedDay: {
    backgroundColor: theme.colors.primaryWeak,
  },
  predictedText: {
    color: theme.isDark ? '#ffb3d1' : '#ad1457',
    fontWeight: '700',
  },
  fertileWindowDay: {
    backgroundColor: theme.colors.tealSoft,
  },
  ovulationDot: {
    position: 'absolute',
    bottom: 3,
    left: '50%',
    marginLeft: -2.5,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: OVULATION_COLOR,
  },
  ovulationDotPredicted: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: OVULATION_COLOR,
  },
  legendTodayDot: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: theme.colors.today,
  },
  fertilityValue: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.tealText,
    flexShrink: 1,
    textAlign: 'right',
  },
  fertilityNote: {
    fontSize: 11,
    lineHeight: 16,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 8,
  },
  fertilityEmpty: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 10,
  },
  ovulationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: radii.button,
    borderWidth: 1.5,
    borderColor: OVULATION_COLOR,
    backgroundColor: theme.colors.tealSoft,
  },
  ovulationButtonActive: {
    backgroundColor: OVULATION_COLOR,
  },
  ovulationButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: OVULATION_COLOR,
    marginLeft: 8,
  },
  ovulationButtonTextActive: {
    color: '#fff',
  },
  ovulationHint: {
    ...typography.caption,
    color: theme.colors.textSecondary,
    marginTop: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: 7,
    paddingTop: 9,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  sectionCard: {
    marginHorizontal: 20,
    marginTop: 0,
  },
  predictionInfo: {
    gap: 0,
  },
  predictionInfoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  predictionInfoItemLast: {
    borderBottomWidth: 0,
  },
  predictionInfoLabel: {
    fontSize: 12,
    flexShrink: 1,
    color: theme.colors.textSecondary,
  },
  predictionInfoValue: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primaryText,
  },
  clickableDay: {
    opacity: 0.9,
  },
  modalCard: {
    marginHorizontal: 20,
    marginVertical: 8,
  },
  modalCardTitle: {
    ...typography.cardTitle,
    color: theme.colors.text,
    marginBottom: 14,
  },
  periodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: radii.button,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  periodButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
    marginLeft: 8,
  },
  periodButtonTextActive: {
    color: '#fff',
  },
  flowSection: {
    marginTop: 16,
  },
  flowSectionTitle: {
    ...typography.rowTitle,
    color: theme.colors.textSecondary,
    marginBottom: 9,
  },
  flowButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  flowButton: {
    flex: 1,
    padding: 11,
    marginHorizontal: 4,
    borderRadius: radii.sm,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: theme.colors.secondary,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  flowButtonActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  flowButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  flowButtonTextActive: {
    fontWeight: '800',
    color: theme.colors.primaryText,
  },
  symptomsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  symptomChip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.secondary,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  symptomChipSelected: {
    backgroundColor: theme.colors.primary,
  },
  symptomEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  symptomText: {
    ...typography.caption,
    color: theme.colors.textSecondary,
  },
  symptomTextSelected: {
    color: theme.colors.white,
    fontWeight: '500',
  },

});
