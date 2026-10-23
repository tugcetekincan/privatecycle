import * as SQLite from 'expo-sqlite';
import { buildCycleModel, phaseForDateInWindows } from './CycleModel';

export interface CycleAnalytics {
  averageCycleLength: number;
  cycleVariability: number;
  periodLengthTrend: number[];
  symptomsByPhase: {
    follicular: { [symptom: string]: number };
    ovulation: { [symptom: string]: number };
    luteal: { [symptom: string]: number };
    menstrual: { [symptom: string]: number };
  };
  moodByPhase: {
    follicular: { [mood: string]: number };
    ovulation: { [mood: string]: number };
    luteal: { [mood: string]: number };
    menstrual: { [mood: string]: number };
  };
  predictiveAccuracy: number;
}

export interface MonthlyStats {
  month: string;
  totalPeriodDays: number;
  averagePeriodLength: number;
  mostCommonSymptoms: string[];
  dominantMood: string;
}

class SQLiteAnalyticsService {
  private db: SQLite.SQLiteDatabase | null = null;

  private async getDatabase(): Promise<SQLite.SQLiteDatabase> {
    if (!this.db) {
      this.db = await SQLite.openDatabaseAsync('cycle_tracker.db');
    }
    return this.db;
  }

  /**
   * Load the shared cycle model. Phases and the calendar forecast both derive
   * from this, so recorded ovulation days and the personal luteal length move
   * the two views together.
   */
  private async loadCycleModel() {
    const db = await this.getDatabase();

    const periodStarts = await db.getAllAsync(`
      SELECT date
      FROM daily_data
      WHERE is_period = 1
      AND NOT EXISTS (
        SELECT 1 FROM daily_data prev
        WHERE prev.date = DATE(daily_data.date, '-1 day')
        AND prev.is_period = 1
      )
      ORDER BY date
    `) as { date: string }[];

    const ovulationDays = await db.getAllAsync(
      'SELECT date FROM daily_data WHERE is_ovulation = 1 ORDER BY date'
    ) as { date: string }[];

    return buildCycleModel({
      periodStarts: periodStarts.map((row) => row.date),
      ovulationDays: ovulationDays.map((row) => row.date),
      today: new Date(),
    });
  }

  async getCyclePhase(date: string): Promise<'menstrual' | 'follicular' | 'ovulation' | 'luteal'> {
    const model = await this.loadCycleModel();
    return phaseForDateInWindows(date, model.windows) ?? 'follicular';
  }

  async getDetailedCycleAnalytics(): Promise<CycleAnalytics> {
    const db = await this.getDatabase();

    // Get all period starts for cycle calculations
    const periodStarts = await db.getAllAsync(`
      SELECT date
      FROM daily_data
      WHERE is_period = 1
      AND NOT EXISTS (
        SELECT 1 FROM daily_data prev
        WHERE prev.date = DATE(daily_data.date, '-1 day')
        AND prev.is_period = 1
      )
      ORDER BY date
    `) as { date: string }[];

    const ovulationRows = await db.getAllAsync(
      'SELECT date FROM daily_data WHERE is_ovulation = 1 ORDER BY date'
    ) as { date: string }[];
    const cycleModel = buildCycleModel({
      periodStarts: periodStarts.map((row) => row.date),
      ovulationDays: ovulationRows.map((row) => row.date),
      today: new Date(),
    });

    // Calculate cycle lengths and variability
    const cycleLengths: number[] = [];
    for (let i = 1; i < periodStarts.length; i++) {
      const days = Math.floor(
        (new Date(periodStarts[i].date).getTime() - new Date(periodStarts[i - 1].date).getTime()) / (1000 * 60 * 60 * 24)
      );
      cycleLengths.push(days);
    }

    const averageCycleLength = cycleLengths.length > 0 
      ? cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length 
      : 28;

    const cycleVariability = cycleLengths.length > 1
      ? Math.sqrt(cycleLengths.reduce((acc, length) => acc + Math.pow(length - averageCycleLength, 2), 0) / cycleLengths.length)
      : 0;

    // Get period length trends
    const periodLengthTrend: number[] = [];
    for (const start of periodStarts) {
      const periodLength = await db.getFirstAsync(`
        SELECT COUNT(*) as length
        FROM daily_data
        WHERE date >= ? AND is_period = 1
        AND date < (
          SELECT MIN(date) 
          FROM daily_data d2 
          WHERE d2.date > ? AND d2.is_period = 0
        )
      `, [start.date, start.date]) as { length: number } | null;
      
      if (periodLength) {
        periodLengthTrend.push(periodLength.length);
      }
    }

    // Analyze symptoms and moods by cycle phase
    const allDailyData = await db.getAllAsync(`
      SELECT date, symptoms, mood
      FROM daily_data
      WHERE symptoms != '[]' OR mood != ''
      ORDER BY date
    `) as { date: string; symptoms: string; mood: string }[];

    const symptomsByPhase = {
      follicular: {} as { [symptom: string]: number },
      ovulation: {} as { [symptom: string]: number },
      luteal: {} as { [symptom: string]: number },
      menstrual: {} as { [symptom: string]: number }
    };

    const moodByPhase = {
      follicular: {} as { [mood: string]: number },
      ovulation: {} as { [mood: string]: number },
      luteal: {} as { [mood: string]: number },
      menstrual: {} as { [mood: string]: number }
    };

    for (const day of allDailyData) {
      const phase = phaseForDateInWindows(day.date, cycleModel.windows) ?? 'follicular';
      
      // Count symptoms
      try {
        const symptoms = JSON.parse(day.symptoms);
        symptoms.forEach((symptom: string) => {
          symptomsByPhase[phase][symptom] = (symptomsByPhase[phase][symptom] || 0) + 1;
        });
      } catch (e) {
        // Ignore parsing errors
      }
      
      // Count moods
      if (day.mood) {
        moodByPhase[phase][day.mood] = (moodByPhase[phase][day.mood] || 0) + 1;
      }
    }

    // Calculate prediction accuracy (simplified)
    const predictiveAccuracy = cycleLengths.length > 2 
      ? Math.max(0, 100 - (cycleVariability * 3)) 
      : 0;

    return {
      averageCycleLength,
      cycleVariability,
      periodLengthTrend,
      symptomsByPhase,
      moodByPhase,
      predictiveAccuracy
    };
  }

  async getMonthlyStatistics(): Promise<MonthlyStats[]> {
    const db = await this.getDatabase();

    const monthlyData = await db.getAllAsync(`
      SELECT 
        strftime('%Y-%m', date) as month,
        SUM(CASE WHEN is_period = 1 THEN 1 ELSE 0 END) as total_period_days,
        symptoms,
        mood
      FROM daily_data
      GROUP BY strftime('%Y-%m', date)
      ORDER BY month DESC
      LIMIT 12
    `) as { 
      month: string; 
      total_period_days: number; 
      symptoms: string; 
      mood: string 
    }[];

    const monthlyStats: MonthlyStats[] = [];

    for (const monthData of monthlyData) {
      // Get detailed data for this month
      const monthDetailData = await db.getAllAsync(`
        SELECT date, is_period, symptoms, mood
        FROM daily_data
        WHERE strftime('%Y-%m', date) = ?
        ORDER BY date
      `, [monthData.month]) as {
        date: string;
        is_period: number;
        symptoms: string;
        mood: string;
      }[];

      // Calculate average period length for this month
      let periodCount = 0;
      let totalPeriodLength = 0;
      let currentPeriodLength = 0;
      let inPeriod = false;

      for (const day of monthDetailData) {
        if (day.is_period === 1) {
          if (!inPeriod) {
            inPeriod = true;
            currentPeriodLength = 1;
          } else {
            currentPeriodLength++;
          }
        } else {
          if (inPeriod) {
            totalPeriodLength += currentPeriodLength;
            periodCount++;
            inPeriod = false;
            currentPeriodLength = 0;
          }
        }
      }

      // Handle case where period continues to end of month
      if (inPeriod && currentPeriodLength > 0) {
        totalPeriodLength += currentPeriodLength;
        periodCount++;
      }

      const averagePeriodLength = periodCount > 0 ? totalPeriodLength / periodCount : 0;

      // Get most common symptoms
      const symptomCounts: { [symptom: string]: number } = {};
      monthDetailData.forEach(day => {
        try {
          const symptoms = JSON.parse(day.symptoms);
          symptoms.forEach((symptom: string) => {
            symptomCounts[symptom] = (symptomCounts[symptom] || 0) + 1;
          });
        } catch (e) {
          // Ignore parsing errors
        }
      });

      const mostCommonSymptoms = Object.entries(symptomCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([symptom]) => symptom);

      // Get dominant mood
      const moodCounts: { [mood: string]: number } = {};
      monthDetailData.forEach(day => {
        if (day.mood) {
          moodCounts[day.mood] = (moodCounts[day.mood] || 0) + 1;
        }
      });

      const dominantMood = Object.entries(moodCounts)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'N/A';

      monthlyStats.push({
        month: monthData.month,
        totalPeriodDays: monthData.total_period_days,
        averagePeriodLength,
        mostCommonSymptoms,
        dominantMood
      });
    }

    return monthlyStats;
  }

  async getCustomQuery(query: string, params: any[] = []): Promise<any[]> {
    const db = await this.getDatabase();
    
    // Security check - only allow SELECT statements
    if (!query.trim().toLowerCase().startsWith('select')) {
      throw new Error('Only SELECT queries are allowed');
    }

    return await db.getAllAsync(query, params);
  }
}

export const AnalyticsService = new SQLiteAnalyticsService(); 