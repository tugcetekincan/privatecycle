import {
  buildNotificationPlan,
  NOTIFICATION_CHANNELS,
} from '@/services/NotificationPlanner';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettings,
} from '@/services/NotificationSettings';

const baseSettings = (overrides: Partial<NotificationSettings> = {}): NotificationSettings => ({
  ...DEFAULT_NOTIFICATION_SETTINGS,
  configured: true,
  enabled: true,
  privacy: 'detailed',
  tone: 'friendly',
  periodReminder: false,
  lateCheckIn: false,
  fertileWindow: false,
  phaseTips: false,
  loggingReminder: false,
  backupReminder: false,
  weeklySummary: false,
  ...overrides,
});

const periodStarts = ['2026-09-01', '2026-09-29'];
const today = new Date(2026, 9, 20, 12, 0, 0); // Tue Oct 20 2026, local noon

const planFor = (settings: NotificationSettings, extra: Partial<Parameters<typeof buildNotificationPlan>[0]> = {}) =>
  buildNotificationPlan({
    settings,
    now: today,
    periodStarts,
    ovulationDays: [],
    todayHasData: false,
    lastBackupAt: null,
    trackedDays: 0,
    ...extra,
  });

describe('buildNotificationPlan', () => {
  it('returns no cycle reminders without period history', () => {
    const plan = planFor(
      baseSettings({
        periodReminder: true,
        lateCheckIn: true,
        fertileWindow: true,
        phaseTips: true,
      }),
      { periodStarts: [] }
    );

    expect(plan).toEqual([]);
  });

  it('schedules the period reminder at 09:00 with the configured lead time', () => {
    const plan = planFor(baseSettings({ periodReminder: true, periodLeadDays: 2 }));
    const reminder = plan.find((item) => item.kind === 'period');

    expect(reminder).toBeDefined();
    expect(reminder?.dateKey).toBe('2026-10-25');
    expect(reminder?.date.getHours()).toBe(9);
    expect(reminder?.date.getMinutes()).toBe(0);
    expect(reminder?.body).toBe(
      "Your period is predicted in 2 days. Open PrivateCycle when you're ready."
    );
    expect(reminder?.channelId).toBe(NOTIFICATION_CHANNELS.cycle);
  });

  it('schedules a late-period check-in two days after the prediction', () => {
    const plan = planFor(baseSettings({ lateCheckIn: true }));
    const checkIn = plan.find((item) => item.kind === 'latePeriod');

    expect(checkIn).toBeDefined();
    expect(checkIn?.dateKey).toBe('2026-10-29');
    expect(checkIn?.body).toContain('predicted start has passed');
  });

  it('does not schedule reminders in the past or outside the horizon', () => {
    const plan = planFor(baseSettings({ periodReminder: true, periodLeadDays: 5 }));
    // The first prediction is Oct 27; a 5-day lead would land on Oct 22, which
    // is still future. The second prediction (Nov 24) is within 90 days, the
    // third (Dec 22) is 63 days out, so all three are scheduled.
    expect(plan.every((item) => item.date.getTime() > today.getTime())).toBe(true);
    expect(plan.length).toBe(3);
  });

  it('uses the predicted fertile window and keeps the wellness caveat', () => {
    const plan = planFor(baseSettings({ fertileWindow: true }));
    const reminder = plan.find((item) => item.kind === 'fertile');

    expect(reminder).toBeDefined();
    expect(reminder?.dateKey).toBe('2026-11-04');
    expect(reminder?.body).toContain('not contraception');
  });

  it('schedules one phase tip per predicted phase transition', () => {
    const plan = planFor(baseSettings({ phaseTips: true }), {
      periodStarts: ['2026-09-01', '2026-09-29'],
    });
    const phases = plan.filter((item) => item.kind === 'phase');

    expect(phases.length).toBeGreaterThanOrEqual(4);
    expect(phases.some((item) => item.dateKey === '2026-10-27')).toBe(true);
    expect(phases.some((item) => item.title === 'Luteal phase')).toBe(true);
    expect(phases.every((item) => item.date.getHours() === 8)).toBe(true);
  });

  it('hides cycle words when the privacy setting is discreet', () => {
    const plan = planFor(
      baseSettings({ periodReminder: true, lateCheckIn: true, privacy: 'discreet' })
    );

    for (const item of plan) {
      expect(item.title).toBe('PrivateCycle');
      expect(item.body.toLowerCase()).not.toContain('period');
      expect(item.body.toLowerCase()).not.toContain('fertile');
    }
  });

  it('changes the voice in detailed copy', () => {
    const friendly = planFor(
      baseSettings({ periodReminder: true, tone: 'friendly' })
    ).find((item) => item.kind === 'period');
    const girly = planFor(
      baseSettings({ periodReminder: true, tone: 'girly' })
    ).find((item) => item.kind === 'period');
    const formal = planFor(
      baseSettings({ periodReminder: true, tone: 'formal' })
    ).find((item) => item.kind === 'period');

    expect(friendly?.body).toContain('when you');
    expect(girly?.body).toContain('💕');
    expect(formal?.body).toContain('Review or update');
  });

  it('skips today’s logging nudge when today already has an entry', () => {
    const plan = planFor(
      baseSettings({ loggingReminder: true, loggingCadence: 'daily', loggingTime: '20:00' }),
      { todayHasData: true }
    );
    const logging = plan.filter((item) => item.kind === 'logging');

    expect(logging.some((item) => item.dateKey === '2026-10-20')).toBe(false);
    expect(logging.some((item) => item.dateKey === '2026-10-21')).toBe(true);
    expect(logging.length).toBe(13);
  });

  it('supports a weekly logging cadence on Sunday', () => {
    const plan = planFor(
      baseSettings({
        loggingReminder: true,
        loggingCadence: 'weekly',
        loggingTime: '20:00',
      })
    );
    const logging = plan.filter((item) => item.kind === 'logging');

    expect(logging[0].dateKey).toBe('2026-10-25');
    expect(logging.every((item) => item.date.getDay() === 0)).toBe(true);
  });

  it('schedules a weekly summary on Sunday at 18:00', () => {
    const plan = planFor(baseSettings({ weeklySummary: true }), { trackedDays: 7 });
    const summary = plan.find((item) => item.kind === 'weeklySummary');

    expect(summary?.dateKey).toBe('2026-10-25');
    expect(summary?.date.getHours()).toBe(18);
    expect(summary?.channelId).toBe(NOTIFICATION_CHANNELS.insights);
  });

  it('schedules a backup reminder once the user has a week of data', () => {
    const plan = planFor(baseSettings({ backupReminder: true }), { trackedDays: 7 });
    const backup = plan.find((item) => item.kind === 'backup');

    expect(backup?.dateKey).toBe('2026-10-21');
    expect(backup?.date.getHours()).toBe(10);
  });

  it('does not nudge for a backup while there is no data', () => {
    const plan = planFor(baseSettings({ backupReminder: true }), { trackedDays: 3 });
    expect(plan.some((item) => item.kind === 'backup')).toBe(false);
  });

  it('does not send a weekly summary before anything is tracked', () => {
    const plan = planFor(baseSettings({ weeklySummary: true }), { trackedDays: 0 });
    expect(plan.some((item) => item.kind === 'weeklySummary')).toBe(false);
  });

  it('waits 30 days after a recent backup', () => {
    const twoDaysAgo = today.getTime() - 2 * 24 * 60 * 60 * 1000;
    const plan = planFor(baseSettings({ backupReminder: true }), {
      lastBackupAt: twoDaysAgo,
      trackedDays: 30,
    });
    const backup = plan.find((item) => item.kind === 'backup');

    expect(backup).toBeDefined();
    expect(backup?.dateKey).toBe('2026-11-17');
  });

  it('keeps the plan sorted and within the pending-notification limit', () => {
    const plan = planFor(
      baseSettings({
        periodReminder: true,
        lateCheckIn: true,
        fertileWindow: true,
        phaseTips: true,
        loggingReminder: true,
        backupReminder: true,
        weeklySummary: true,
      }),
      { trackedDays: 30 }
    );

    expect(plan.length).toBeLessThanOrEqual(60);
    for (let index = 1; index < plan.length; index++) {
      expect(plan[index].date.getTime()).toBeGreaterThanOrEqual(
        plan[index - 1].date.getTime()
      );
    }
  });
});
