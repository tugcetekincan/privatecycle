import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  TextInput,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Heart, Droplets, Smile, Calendar, ChevronDown, Egg } from 'lucide-react-native';
import { DataService } from '@/services/DataService';
import { useTheme } from '@/hooks/useTheme';
import { useDialog } from '@/hooks/useDialog';

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

// Intentional accent for ovulation marks; keeps them distinct from period pink.
const OVULATION_COLOR = '#009688';

export default function TrackTab() {
  const { theme } = useTheme();
  const { showSuccess, DialogComponent } = useDialog();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isPeriodDay, setIsPeriodDay] = useState(false);
  const [isOvulation, setIsOvulation] = useState(false);
  const [flowLevel, setFlowLevel] = useState('');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [selectedMood, setSelectedMood] = useState('');
  const [todayData, setTodayData] = useState<any>(null);

  useEffect(() => {
    loadTodayData();
  }, [selectedDate]);

  const loadTodayData = async () => {
    const dateKey = DataService.formatDateKey(selectedDate);
    const data = await DataService.getTodayData(dateKey);
    
    if (data) {
      setTodayData(data);
      setIsPeriodDay(data.isPeriod || false);
      setIsOvulation(data.isOvulation || false);
      setFlowLevel(data.flowLevel || '');
      setSelectedSymptoms(data.symptoms || []);
      setSelectedMood(data.mood || '');
    } else {
      // Reset for new day
      setTodayData(null);
      setIsPeriodDay(false);
      setIsOvulation(false);
      setFlowLevel('');
      setSelectedSymptoms([]);
      setSelectedMood('');
    }
  };

  const saveData = async () => {
    const dateKey = DataService.formatDateKey(selectedDate);
    const data = {
      date: dateKey,
      isPeriod: isPeriodDay,
      flowLevel: isPeriodDay ? flowLevel : '',
      symptoms: selectedSymptoms,
      mood: selectedMood,
      isOvulation,
    };

    await DataService.saveTodayData(dateKey, data);
    showSuccess('Success', 'Your data has been saved!');
    loadTodayData();
  };

  const toggleSymptom = (symptomId: string) => {
    setSelectedSymptoms(prev => 
      prev.includes(symptomId) 
        ? prev.filter(id => id !== symptomId)
        : [...prev, symptomId]
    );
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    
    if (selectedDate) {
      setSelectedDate(selectedDate);
    }
  };

  const showDatePickerModal = () => {
    setShowDatePicker(true);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Track Your Day</Text>
          <Heart size={24} color={theme.colors.primary} />
        </View>

        {/* Date Selection */}
        <TouchableOpacity testID="track-date-card" style={styles.dateCard} onPress={showDatePickerModal}>
          <Calendar size={20} color={theme.colors.textSecondary} />
          <View style={styles.dateContent}>
            <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
            {isToday(selectedDate) && (
              <Text style={styles.todayBadge}>Today</Text>
            )}
            {todayData && (
              <Text testID="track-has-data" style={styles.hasDataBadge}>Has Data</Text>
            )}
          </View>
          <ChevronDown size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>

        {Platform.OS === 'web' ? (
          showDatePicker && (
            <View style={styles.webDatePickerContainer}>
              <input
                type="date"
                data-testid="track-date-input"
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  border: `1px solid ${theme.colors.border}`,
                  fontSize: 16,
                  backgroundColor: theme.colors.surface,
                  color: theme.colors.text,
                  marginBottom: 10,
                }}
                value={DataService.formatDateKey(selectedDate)}
                onChange={(e) => {
                  const date = new Date(e.target.value);
                  if (!isNaN(date.getTime())) {
                    setSelectedDate(date);
                  }
                }}
                autoFocus={true}
              />
              <TouchableOpacity 
                testID="track-date-done"
                style={styles.datePickerButton}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.datePickerButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          )
        ) : (
          showDatePicker && (
                          <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onDateChange}
              />
          )
        )}

        {Platform.OS === 'ios' && showDatePicker && (
          <View style={styles.datePickerButtons}>
            <TouchableOpacity 
              style={styles.datePickerButton}
              onPress={() => setShowDatePicker(false)}
            >
              <Text style={styles.datePickerButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Period Tracking */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Period</Text>
          <TouchableOpacity 
            testID="track-period-toggle"
            style={[styles.periodButton, isPeriodDay && styles.periodButtonActive]}
            onPress={() => setIsPeriodDay(!isPeriodDay)}>
            <Droplets size={20} color={isPeriodDay ? theme.colors.white : theme.colors.primary} />
            <Text style={[styles.periodButtonText, isPeriodDay && styles.periodButtonTextActive]}>
              {isPeriodDay ? 'Period Day' : 'No Period'}
            </Text>
          </TouchableOpacity>

          {/* Flow Level */}
          {isPeriodDay && (
            <View style={styles.flowSection}>
              <Text style={styles.sectionTitle}>Flow Level</Text>
              <View style={styles.flowButtons}>
                {FLOW_LEVELS.map(level => (
                  <TouchableOpacity
                    key={level.id}
                    testID={`track-flow-${level.id}`}
                    style={[
                      styles.flowButton,
                      { backgroundColor: level.color },
                      flowLevel === level.id && styles.flowButtonActive
                    ]}
                    onPress={() => setFlowLevel(level.id)}>
                    <Text style={[
                      styles.flowButtonText,
                      flowLevel === level.id && styles.flowButtonTextActive
                    ]}>
                      {level.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Ovulation */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ovulation</Text>
          <TouchableOpacity
            testID="track-ovulation-toggle"
            style={[styles.ovulationButton, isOvulation && styles.ovulationButtonActive]}
            onPress={() => setIsOvulation(!isOvulation)}>
            <Egg size={20} color={isOvulation ? theme.colors.white : OVULATION_COLOR} />
            <Text style={[styles.ovulationButtonText, isOvulation && styles.ovulationButtonTextActive]}>
              {isOvulation ? 'Ovulation Day' : 'No Ovulation'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Symptoms */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Symptoms</Text>
          <View style={styles.symptomsGrid}>
            {SYMPTOMS.map(symptom => (
              <TouchableOpacity
                key={symptom.id}
                testID={`track-symptom-${symptom.id}`}
                style={[
                  styles.symptomButton,
                  selectedSymptoms.includes(symptom.id) && styles.symptomButtonActive
                ]}
                onPress={() => toggleSymptom(symptom.id)}>
                <Text style={styles.symptomEmoji}>{symptom.icon}</Text>
                <Text style={[
                  styles.symptomText,
                  selectedSymptoms.includes(symptom.id) && styles.symptomTextActive
                ]}>
                  {symptom.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Mood */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mood</Text>
          <View style={styles.moodsRow}>
            {MOODS.map(mood => (
              <TouchableOpacity
                key={mood.id}
                testID={`track-mood-${mood.id}`}
                style={[
                  styles.moodButton,
                  { borderColor: mood.color },
                  selectedMood === mood.id && { backgroundColor: mood.color }
                ]}
                onPress={() => setSelectedMood(mood.id)}>
                <Text style={styles.moodEmoji}>{mood.icon}</Text>
                <Text style={[
                  styles.moodText,
                  selectedMood === mood.id && styles.moodTextActive
                ]}>
                  {mood.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity testID="track-save-button" style={styles.saveButton} onPress={saveData}>
          <Text style={styles.saveButtonText}>
            {isToday(selectedDate) ? "Save" : `Save for ${selectedDate.toLocaleDateString()}`}
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    marginHorizontal: 20,
    marginVertical: 10,
    padding: 15,
    borderRadius: 12,
    elevation: 2,
    shadowColor: theme.colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dateContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 10,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
  },
  todayBadge: {
    backgroundColor: theme.colors.today,
    color: theme.colors.white,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
    fontWeight: '500',
  },
  hasDataBadge: {
    backgroundColor: theme.colors.accent,
    color: theme.colors.white,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 5,
    fontWeight: '500',
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
  ovulationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: OVULATION_COLOR,
  },
  ovulationButtonActive: {
    backgroundColor: OVULATION_COLOR,
  },
  ovulationButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: OVULATION_COLOR,
    marginLeft: 8,
  },
  ovulationButtonTextActive: {
    color: '#fff',
  },
  flowSection: {
    marginTop: 20,
  },
  sectionTitle: {
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
    justifyContent: 'space-between',
  },
  symptomButton: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginVertical: 5,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
  },
  symptomButtonActive: {
    backgroundColor: '#e91e63',
    borderColor: '#e91e63',
  },
  symptomEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  symptomText: {
    fontSize: 14,
    color: theme.colors.text,
    flex: 1,
  },
  symptomTextActive: {
    color: '#fff',
    fontWeight: '500',
  },
  moodsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  moodButton: {
    width: '30%',
    alignItems: 'center',
    padding: 12,
    marginVertical: 5,
    borderWidth: 2,
    borderRadius: 10,
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
  moodTextActive: {
    color: '#fff',
  },
  saveButton: {
    backgroundColor: '#e91e63',
    marginHorizontal: 20,
    marginVertical: 20,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  datePickerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
  },
  datePickerButton: {
    padding: 10,
    borderRadius: 5,
    backgroundColor: '#e91e63',
  },
  datePickerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  webDatePickerContainer: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: 20,
    marginVertical: 10,
    padding: 15,
    borderRadius: 12,
    elevation: 2,
    shadowColor: theme.colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },

});