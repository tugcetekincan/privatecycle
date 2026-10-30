import {
  buildCycleModel,
  CyclePhase,
  MENSTRUAL_PHASE_DAYS,
} from './CycleModel';
import { addDays, formatDateKey, parseDateKey } from './dateKey';
import {
  backupReminderCopy,
  fertileWindowCopy,
  lateCheckInCopy,
  loggingReminderCopy,
  periodReminderCopy,
  phaseTipCopy,
  weeklySummaryCopy,
} from './NotificationCopy';
import type { NotificationSettings } from './NotificationSettings';

/**
 * Pure reminder planner: turns cycle history + notification preferences into
 * the concrete notifications to schedule. It has no Expo/notification imports
 * so the dates and copy can be unit-tested on any platform.
 *
 * The service schedules a rolling horizon and re-runs on app foreground and
 * after cycle data changes. Cycle reminders cover the next three predicted
 * cycles; daily logging reminders cover two weeks. That keeps the pending
 * count comfortably below iOS's 64-notification limit.
 */

export type PlannedNotificationKind =
  | 'period'
  | 'latePeriod'
  | 'fertile'
  | 'phase'
  | 'logging'
  | 'backup'
  | 'weeklySummary';

export interface PlannedNotification {
  /** Stable id, prefixed so the service can cancel only its own notifications. */
  id: string;
  kind: PlannedNotificationKind;
  date: Date;
  dateKey: string;
  title: string;
  body: string;
  channelId: string;
  data: { url: string };
}

export interface NotificationPlanInput {
  settings: NotificationSettings;
  now: Date;
  /** Recorded period start day keys, ascending. */
  periodStarts: string[];
  /** Recorded ovulation day keys, ascending. */
  ovulationDays: string[];
  /** Whether today already has a saved entry (suppresses today's log nudge). */
  todayHasData: boolean;
  /** `BackupService` lastBackupTime, or null when no backup was tracked. */
  lastBackupAt: number | null;
  /** Number of days with a saved entry. */
  trackedDays: number;
}

export const NOTIFICATION_ID_PREFIX = 'pc-';

export const NOTIFICATION_CHANNELS = {
  cycle: 'cycle',
  logging: 'logging',
  backup: 'backup',
  insights: 'insights',
} as const;

export const CYCLE_URL = '/(tabs)';
export const INSIGHTS_URL = '/(tabs)/insights';
export const SETTINGS_URL = '/(tabs)/settings';

const PERIOD_TIME = '09:00';
const PHASE_TIME = '08:00';
const BACKUP_TIME = '10:00';
const WEEKLY_SUMMARY_TIME = '18:00';
const LATE_CHECK_IN_DAYS = 2;
const PREDICTED_CYCLES_TO_SCHEDULE = 3;
const LOGGING_DAYS = 14;
const LOGGING_WEEKS = 8;
const WEEKLY_SUMMARY_WEEKS = 8;
const BACKUP_INTERVAL_DAYS = 30;
const BACKUP_GRACE_DAYS = 7;
const HORIZON_DAYS = 90;
const MAX_NOTIFICATIONS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_LEAD_MS = 60 * 1000;

const addDaysKey = (dateKey: string, days: number): string =>
  formatDateKey(addDays(parseDateKey(dateKey), days));

const atLocalTime = (dateKey: string, time: string): Date => {
  const [hour, minute] = time.split(':').map(Number);
  const date = parseDateKey(dateKey);
  date.setHours(hour, minute, 0, 0);
  return date;
};

/** Days until the next Sunday, 0 when today is Sunday. */
const daysUntilSunday = (todayKey: string): number =>
  (7 - parseDateKey(todayKey).getDay()) % 7;

const isFuture = (date: Date, now: Date): boolean =>
  date.getTime() > now.getTime() + MIN_LEAD_MS;

const isWithinHorizon = (date: Date, now: Date): boolean =>
  date.getTime() <= now.getTime() + HORIZON_DAYS * DAY_MS;

export function buildNotificationPlan(input: NotificationPlanInput): PlannedNotification[] {
  const { settings, now, periodStarts, ovulationDays, todayHasData } = input;
  const todayKey = formatDateKey(now);
  const items: PlannedNotification[] = [];
  const seen = new Set<string>();

  const add = (item: PlannedNotification): void => {
    if (seen.has(item.id) || !isFuture(item.date, now) || !isWithinHorizon(item.date, now)) {
      return;
    }
    seen.add(item.id);
    items.push(item);
  };

  const model = buildCycleModel({ periodStarts, ovulationDays, today: now });
  const futureStarts = model.futurePeriodStarts.slice(0, PREDICTED_CYCLES_TO_SCHEDULE);
  const windowByEnd = new Map(model.windows.map((window) => [window.end, window]));

  for (const start of futureStarts) {
    if (settings.periodReminder) {
      const dateKey = addDaysKey(start, -settings.periodLeadDays);
      const copy = periodReminderCopy(settings, settings.periodLeadDays);
      add({
        id: `${NOTIFICATION_ID_PREFIX}period-${start}`,
        kind: 'period',
        date: atLocalTime(dateKey, PERIOD_TIME),
        dateKey,
        title: copy.title,
        body: copy.body,
        channelId: NOTIFICATION_CHANNELS.cycle,
        data: { url: CYCLE_URL },
      });
    }

    if (settings.lateCheckIn) {
      const dateKey = addDaysKey(start, LATE_CHECK_IN_DAYS);
      const copy = lateCheckInCopy(settings);
      add({
        id: `${NOTIFICATION_ID_PREFIX}late-${start}`,
        kind: 'latePeriod',
        date: atLocalTime(dateKey, PERIOD_TIME),
        dateKey,
        title: copy.title,
        body: copy.body,
        channelId: NOTIFICATION_CHANNELS.cycle,
        data: { url: CYCLE_URL },
      });
    }

    const window = windowByEnd.get(start);
    if (!window) continue;

    if (settings.fertileWindow) {
      const dateKey = addDaysKey(window.fertileWindowStart, -1);
      const copy = fertileWindowCopy(settings);
      add({
        id: `${NOTIFICATION_ID_PREFIX}fertile-${window.fertileWindowStart}`,
        kind: 'fertile',
        date: atLocalTime(dateKey, PERIOD_TIME),
        dateKey,
        title: copy.title,
        body: copy.body,
        channelId: NOTIFICATION_CHANNELS.cycle,
        data: { url: CYCLE_URL },
      });
    }

    if (settings.phaseTips) {
      const phaseDates: { phase: CyclePhase; dateKey: string }[] = [
        { phase: 'menstrual', dateKey: window.start },
        {
          phase: 'follicular',
          dateKey: addDaysKey(window.start, MENSTRUAL_PHASE_DAYS),
        },
        { phase: 'ovulation', dateKey: window.ovulationPhaseStart },
        { phase: 'luteal', dateKey: addDaysKey(window.ovulationPhaseEnd, 1) },
      ];

      for (const entry of phaseDates) {
        // A very short cycle can clamp the ovulation/luteal bound onto the
        // next period start; do not label that day with the previous phase.
        if (entry.dateKey >= window.end) continue;
        const copy = phaseTipCopy(settings, entry.phase);
        add({
          id: `${NOTIFICATION_ID_PREFIX}phase-${entry.phase}-${entry.dateKey}`,
          kind: 'phase',
          date: atLocalTime(entry.dateKey, PHASE_TIME),
          dateKey: entry.dateKey,
          title: copy.title,
          body: copy.body,
          channelId: NOTIFICATION_CHANNELS.cycle,
          data: { url: INSIGHTS_URL },
        });
      }
    }
  }

  if (settings.loggingReminder) {
    const copy = loggingReminderCopy(settings, settings.loggingCadence);

    if (settings.loggingCadence === 'daily') {
      for (let offset = 0; offset < LOGGING_DAYS; offset++) {
        if (offset === 0 && todayHasData) continue;
        const dateKey = addDaysKey(todayKey, offset);
        add({
          id: `${NOTIFICATION_ID_PREFIX}log-${dateKey}`,
          kind: 'logging',
          date: atLocalTime(dateKey, settings.loggingTime),
          dateKey,
          title: copy.title,
          body: copy.body,
          channelId: NOTIFICATION_CHANNELS.logging,
          data: { url: CYCLE_URL },
        });
      }
    } else {
      const sundayOffset = daysUntilSunday(todayKey);
      for (let index = 0; index < LOGGING_WEEKS; index++) {
        if (index === 0 && todayHasData) continue;
        const dateKey = addDaysKey(todayKey, sundayOffset + index * 7);
        add({
          id: `${NOTIFICATION_ID_PREFIX}log-${dateKey}`,
          kind: 'logging',
          date: atLocalTime(dateKey, settings.loggingTime),
          dateKey,
          title: copy.title,
          body: copy.body,
          channelId: NOTIFICATION_CHANNELS.logging,
          data: { url: CYCLE_URL },
        });
      }
    }
  }

  if (settings.weeklySummary && input.trackedDays > 0) {
    const copy = weeklySummaryCopy(settings);
    const sundayOffset = daysUntilSunday(todayKey);
    for (let index = 0; index < WEEKLY_SUMMARY_WEEKS; index++) {
      const dateKey = addDaysKey(todayKey, sundayOffset + index * 7);
      add({
        id: `${NOTIFICATION_ID_PREFIX}weekly-${dateKey}`,
        kind: 'weeklySummary',
        date: atLocalTime(dateKey, WEEKLY_SUMMARY_TIME),
        dateKey,
        title: copy.title,
        body: copy.body,
        channelId: NOTIFICATION_CHANNELS.insights,
        data: { url: INSIGHTS_URL },
      });
    }
  }

  if (settings.backupReminder && input.trackedDays > 0) {
    const intervalMs = BACKUP_INTERVAL_DAYS * DAY_MS;
    const lastBackupAt =
      typeof input.lastBackupAt === 'number' && Number.isFinite(input.lastBackupAt)
        ? input.lastBackupAt
        : null;
    let dueMs: number | null = null;

    if (lastBackupAt && lastBackupAt > 0) {
      dueMs = lastBackupAt + intervalMs;
    } else if (input.trackedDays >= BACKUP_GRACE_DAYS) {
      dueMs = now.getTime() + DAY_MS;
    }

    if (dueMs !== null) {
      let dateKey = formatDateKey(new Date(dueMs));
      if (dateKey <= todayKey) dateKey = addDaysKey(todayKey, 1);
      const copy = backupReminderCopy(settings);
      add({
        id: `${NOTIFICATION_ID_PREFIX}backup-${dateKey}`,
        kind: 'backup',
        date: atLocalTime(dateKey, BACKUP_TIME),
        dateKey,
        title: copy.title,
        body: copy.body,
        channelId: NOTIFICATION_CHANNELS.backup,
        data: { url: SETTINGS_URL },
      });
    }
  }

  items.sort((left, right) => left.date.getTime() - right.date.getTime());
  return items.slice(0, MAX_NOTIFICATIONS);
}
