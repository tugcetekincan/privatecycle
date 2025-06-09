# SQLite Migration Guide

## Overview

The app has been migrated from AsyncStorage to SQLite for better performance, complex querying capabilities, and advanced analytics.

## Migration Process

### Automatic Migration
- The migration happens automatically when you start the app
- Existing AsyncStorage data is transferred to SQLite
- Old AsyncStorage data is cleaned up after successful migration
- Migration status is tracked to prevent duplicate migrations

### Manual Migration
If you need to manually trigger the migration:

```typescript
import { DataService } from '@/services/DataService';

await DataService.migrateFromAsyncStorage();
```

## Database Schema

### `daily_data` Table
```sql
CREATE TABLE daily_data (
  date TEXT PRIMARY KEY,           -- Date in YYYY-MM-DD format
  is_period INTEGER NOT NULL,      -- 1 for period day, 0 for non-period day
  flow_level TEXT NOT NULL,        -- Flow level description
  symptoms TEXT NOT NULL,          -- JSON array of symptoms
  mood TEXT NOT NULL               -- Mood description
);
```

### Indexes
- `idx_daily_data_date`: Optimizes date-based queries
- `idx_daily_data_period`: Optimizes period-related queries

## Enhanced Capabilities

### 1. Complex Analytics

The new `AnalyticsService` provides advanced cycle analysis:

```typescript
import { AnalyticsService } from '@/services/AnalyticsService';

// Get detailed cycle analytics
const analytics = await AnalyticsService.getDetailedCycleAnalytics();
console.log(analytics.averageCycleLength);
console.log(analytics.cycleVariability);
console.log(analytics.symptomsByPhase);

// Get monthly statistics
const monthlyStats = await AnalyticsService.getMonthlyStatistics();
console.log(monthlyStats);
```

### 2. Cycle Phase Detection

Automatically determine the current cycle phase:

```typescript
const phase = await AnalyticsService.getCyclePhase('2024-01-15');
// Returns: 'menstrual' | 'follicular' | 'ovulation' | 'luteal'
```

### 3. Custom Queries

Execute custom SQL queries for advanced analysis:

```typescript
const results = await AnalyticsService.getCustomQuery(`
  SELECT date, symptoms, mood
  FROM daily_data 
  WHERE is_period = 1 
  AND date >= date('now', '-6 months')
  ORDER BY date DESC
`);
```

## Performance Benefits

### Before (AsyncStorage)
- Linear search through all data
- Data loaded into memory for every operation
- No relationship queries
- Limited sorting and filtering

### After (SQLite)
- Indexed queries for fast data retrieval
- SQL aggregations and joins
- Efficient date range queries
- Complex analytics without loading all data

## Example Advanced Queries

### Find Pattern Correlations
```sql
SELECT 
  symptoms,
  mood,
  COUNT(*) as frequency
FROM daily_data 
WHERE symptoms LIKE '%headache%' 
GROUP BY symptoms, mood
ORDER BY frequency DESC;
```

### Cycle Length Trends
```sql
WITH period_starts AS (
  SELECT date
  FROM daily_data
  WHERE is_period = 1
  AND NOT EXISTS (
    SELECT 1 FROM daily_data prev
    WHERE prev.date = DATE(daily_data.date, '-1 day')
    AND prev.is_period = 1
  )
  ORDER BY date
)
SELECT 
  date,
  LAG(date) OVER (ORDER BY date) as prev_start,
  julianday(date) - julianday(LAG(date) OVER (ORDER BY date)) as cycle_length
FROM period_starts;
```

### Symptom Seasonality
```sql
SELECT 
  strftime('%m', date) as month,
  symptoms,
  COUNT(*) as occurrences
FROM daily_data
WHERE symptoms != '[]'
GROUP BY strftime('%m', date), symptoms
ORDER BY month, occurrences DESC;
```

## API Compatibility

The existing `DataService` API remains unchanged, ensuring all existing components continue to work without modifications.

### Maintained Methods
- `DataService.getPeriodData()`
- `DataService.saveTodayData()`
- `DataService.getTodayData()`
- `DataService.getAllDailyData()`
- `DataService.getInsights()`
- `DataService.clearAllData()`
- `DataService.formatDateKey()`

## Future Possibilities

With SQLite, you can now easily implement:

1. **Predictive Analytics**: Machine learning models for cycle prediction
2. **Correlation Analysis**: Statistical relationships between symptoms and cycle phases
3. **Export Features**: Generate detailed reports and CSV exports
4. **Backup/Sync**: Structured data export for cloud synchronization
5. **Advanced Filtering**: Complex search and filter capabilities
6. **Data Visualization**: Efficient data aggregation for charts and graphs

## Troubleshooting

### Migration Issues
If migration fails, check:
1. App permissions for file system access
2. Available storage space
3. Console logs for specific error messages

### Performance
- SQLite files are stored locally on device
- Database size grows with data but remains efficient
- Indexes automatically optimize query performance
- Consider periodic data cleanup for very old records

## Notes

- SQLite is not compatible with web builds (as acknowledged)
- Database file: `cycle_tracker.db`
- Migration is idempotent and safe to run multiple times
- All queries use parameterized statements for security 