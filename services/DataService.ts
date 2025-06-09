import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  PERIOD_DATA: 'period_data',
  DAILY_DATA: 'daily_data',
};

// Utility function to format date without timezone issues
const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export interface DailyData {
  date: string;
  isPeriod: boolean;
  flowLevel: string;
  symptoms: string[];
  mood: string;
}

export interface PeriodData {
  periods: string[];
  symptoms: { [date: string]: string[] };
  moods: { [date: string]: string };
}

export class DataService {
  // Utility function to format date without timezone issues
  static formatDateKey = formatDateKey;

  // Get all period dates
  static async getPeriodData(): Promise<PeriodData> {
    try {
      const data = await AsyncStorage.getItem(KEYS.PERIOD_DATA);
      return data ? JSON.parse(data) : { periods: [], symptoms: {}, moods: {} };
    } catch (error) {
      console.error('Error loading period data:', error);
      return { periods: [], symptoms: {}, moods: {} };
    }
  }

  // Save daily tracking data
  static async saveTodayData(dateKey: string, data: DailyData): Promise<void> {
    try {
      // Save daily data
      const dailyData = await this.getAllDailyData();
      dailyData[dateKey] = data;
      await AsyncStorage.setItem(KEYS.DAILY_DATA, JSON.stringify(dailyData));

      // Update period data
      const periodData = await this.getPeriodData();
      
      if (data.isPeriod && !periodData.periods.includes(dateKey)) {
        periodData.periods.push(dateKey);
      } else if (!data.isPeriod && periodData.periods.includes(dateKey)) {
        periodData.periods = periodData.periods.filter(date => date !== dateKey);
      }

      if (data.symptoms.length > 0) {
        periodData.symptoms[dateKey] = data.symptoms;
      } else {
        delete periodData.symptoms[dateKey];
      }

      if (data.mood) {
        periodData.moods[dateKey] = data.mood;
      } else {
        delete periodData.moods[dateKey];
      }

      await AsyncStorage.setItem(KEYS.PERIOD_DATA, JSON.stringify(periodData));
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }

  // Get today's data
  static async getTodayData(dateKey: string): Promise<DailyData | null> {
    try {
      const dailyData = await this.getAllDailyData();
      return dailyData[dateKey] || null;
    } catch (error) {
      console.error('Error loading today data:', error);
      return null;
    }
  }

  // Get all daily data
  static async getAllDailyData(): Promise<{ [date: string]: DailyData }> {
    try {
      const data = await AsyncStorage.getItem(KEYS.DAILY_DATA);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Error loading daily data:', error);
      return {};
    }
  }

  // Calculate insights
  static async getInsights() {
    try {
      const periodData = await this.getPeriodData();
      const dailyData = await this.getAllDailyData();
      
      // Find period start dates (first day of each consecutive period group)
      const periodStarts: string[] = [];
      if (periodData.periods.length > 0) {
        const sortedPeriods = periodData.periods.sort();
        const periodSet = new Set(sortedPeriods);
        
        for (const periodDate of sortedPeriods) {
          const prevDay = new Date(periodDate);
          prevDay.setDate(prevDay.getDate() - 1);
          const prevDayStr = formatDateKey(prevDay);
          
          // If previous day is not a period day, this is a period start
          if (!periodSet.has(prevDayStr)) {
            periodStarts.push(periodDate);
          }
        }
      }
      
      // Calculate average cycle length based on period start dates
      let averageCycle = 28;
      if (periodStarts.length >= 2) {
        const sortedStarts = periodStarts.sort();
        const cycles: number[] = [];
        
        for (let i = 1; i < sortedStarts.length; i++) {
          const prev = new Date(sortedStarts[i - 1]);
          const curr = new Date(sortedStarts[i]);
          const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
          cycles.push(diff);
        }
        
        if (cycles.length > 0) {
          averageCycle = Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length);
        }
      }

      // Calculate last period length
      let lastPeriodLength = 0;
      if (periodStarts.length > 0) {
        const sortedStarts = periodStarts.sort();
        const lastPeriodStart = sortedStarts[sortedStarts.length - 1];
        const periodSet = new Set(periodData.periods);
        
        // Count consecutive period days from the last period start
        let currentDate = new Date(lastPeriodStart);
        while (periodSet.has(formatDateKey(currentDate))) {
          lastPeriodLength++;
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }

      // Calculate next period prediction
      let nextPeriodIn = 0;
      if (periodStarts.length > 0) {
        const sortedStarts = periodStarts.sort();
        const lastPeriodStart = new Date(sortedStarts[sortedStarts.length - 1]);
        const nextPredicted = new Date(lastPeriodStart);
        nextPredicted.setDate(nextPredicted.getDate() + averageCycle);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset time to start of day
        nextPredicted.setHours(0, 0, 0, 0); // Reset time to start of day
        
        const diffTime = nextPredicted.getTime() - today.getTime();
        nextPeriodIn = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      // Count symptoms
      const symptomCounts: { [key: string]: number } = {};
      Object.values(dailyData).forEach(day => {
        day.symptoms.forEach(symptom => {
          symptomCounts[symptom] = (symptomCounts[symptom] || 0) + 1;
        });
      });

      const commonSymptoms = Object.entries(symptomCounts)
        .map(([symptom, count]) => ({ symptom, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Count moods
      const moodCounts: { [key: string]: number } = {};
      Object.values(dailyData).forEach(day => {
        if (day.mood) {
          moodCounts[day.mood] = (moodCounts[day.mood] || 0) + 1;
        }
      });

      const moodTrends = Object.entries(moodCounts)
        .map(([mood, count]) => ({ mood, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        averageCycle,
        lastPeriodLength,
        nextPeriodIn,
        totalPeriods: periodStarts.length, // Use period cycles count instead of total period days
        commonSymptoms,
        moodTrends,
      };
    } catch (error) {
      console.error('Error calculating insights:', error);
      return {
        averageCycle: 28,
        lastPeriodLength: 0,
        nextPeriodIn: 0,
        totalPeriods: 0,
        commonSymptoms: [],
        moodTrends: [],
      };
    }
  }

  // Clear all data
  static async clearAllData(): Promise<void> {
    try {
      await AsyncStorage.removeItem(KEYS.PERIOD_DATA);
      await AsyncStorage.removeItem(KEYS.DAILY_DATA);
    } catch (error) {
      console.error('Error clearing data:', error);
    }
  }
}