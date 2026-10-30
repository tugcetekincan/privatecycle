import type { CyclePhase } from './CycleModel';
import type { LoggingCadence, NotificationSettings, NotificationTone } from './NotificationSettings';

/**
 * Notification copy for every reminder type, in the three voices the setup
 * screen offers. Discreet copy never names periods, fertility or symptoms on
 * the lock screen; detailed copy does, and is an explicit opt-in.
 *
 * Pure so the preview, the planner and the tests share exactly the same words.
 */

export interface NotificationCopy {
  title: string;
  body: string;
}

const DISCREET_TITLES: Record<NotificationTone, string> = {
  friendly: 'PrivateCycle',
  girly: 'PrivateCycle',
  formal: 'PrivateCycle',
};

const DISCREET_BODIES: Record<NotificationTone, string> = {
  friendly: 'A gentle check-in is ready when you are.',
  girly: 'A little check-in is waiting for you. 💕',
  formal: 'A reminder is available.',
};

const discreet = (tone: NotificationTone): NotificationCopy => ({
  title: DISCREET_TITLES[tone],
  body: DISCREET_BODIES[tone],
});

const pick = (
  tone: NotificationTone,
  friendly: string,
  girly: string,
  formal: string
): string => (tone === 'girly' ? girly : tone === 'formal' ? formal : friendly);

export function periodReminderCopy(
  settings: NotificationSettings,
  daysBefore: number
): NotificationCopy {
  if (settings.privacy === 'discreet') return discreet(settings.tone);

  const days = daysBefore === 1 ? '1 day' : `${daysBefore} days`;
  return {
    title: pick(settings.tone, 'Period predicted', 'Period coming up', 'Period prediction'),
    body: pick(
      settings.tone,
      `Your period is predicted in ${days}. Open PrivateCycle when you're ready.`,
      `Your period is expected in ${days}. Time for a little extra care. 💕`,
      `Period predicted in ${days}. Review or update your log in PrivateCycle.`
    ),
  };
}

export function lateCheckInCopy(settings: NotificationSettings): NotificationCopy {
  if (settings.privacy === 'discreet') return discreet(settings.tone);

  return {
    title: pick(settings.tone, 'A gentle check-in', 'Still waiting?', 'Cycle check-in'),
    body: pick(
      settings.tone,
      "Your predicted start has passed. Log your period whenever you're ready.",
      'No pressure — log your period whenever you feel ready. 💕',
      'Predicted period start has passed. Update your log when convenient.'
    ),
  };
}

export function fertileWindowCopy(settings: NotificationSettings): NotificationCopy {
  if (settings.privacy === 'discreet') return discreet(settings.tone);

  return {
    title: pick(settings.tone, 'Fertile window', 'Fertile window', 'Fertility estimate'),
    body: pick(
      settings.tone,
      'Your estimated fertile window starts tomorrow. This is a wellness estimate, not contraception.',
      'Your estimated fertile window opens tomorrow. A gentle heads-up, not birth control. 💕',
      'Estimated fertile window begins tomorrow. Wellness estimate only; not a contraceptive method.'
    ),
  };
}

const PHASE_COPY: Record<
  CyclePhase,
  Record<NotificationTone, NotificationCopy>
> = {
  menstrual: {
    friendly: {
      title: 'Menstrual phase',
      body: 'The menstrual phase may begin today. Rest and replenish with warmth and iron-rich food.',
    },
    girly: {
      title: 'Period care mode',
      body: 'Your period may start today. Warmth, iron-rich food and a slower day, okay? 💕',
    },
    formal: {
      title: 'Menstrual phase',
      body: 'Menstrual phase may begin. Rest and replenish; warmth and iron-rich food may help.',
    },
  },
  follicular: {
    friendly: {
      title: 'Follicular phase',
      body: 'Energy often rises now. A good window for the task you keep postponing.',
    },
    girly: {
      title: 'Fresh-start energy',
      body: 'Energy is on the rise. A good moment for the task you keep postponing. ✨',
    },
    formal: {
      title: 'Follicular phase',
      body: 'Energy may rise. Consider tackling a demanding task.',
    },
  },
  ovulation: {
    friendly: {
      title: 'Ovulation phase',
      body: 'Peak energy and connection. Listen to your body and stay hydrated.',
    },
    girly: {
      title: 'Peak glow',
      body: 'Energy and confidence often peak now. Listen to your body and stay hydrated. 🌟',
    },
    formal: {
      title: 'Ovulation phase',
      body: 'Energy and confidence may peak. Stay hydrated and monitor how you feel.',
    },
  },
  luteal: {
    friendly: {
      title: 'Luteal phase',
      body: 'Wind down gently. Steady meals and an earlier night may help.',
    },
    girly: {
      title: 'Cozy-down phase',
      body: 'Time to wind down gently. Steady meals and an earlier night may help. 🌙',
    },
    formal: {
      title: 'Luteal phase',
      body: 'Wind down. Regular meals and earlier sleep may help.',
    },
  },
};

export function phaseTipCopy(
  settings: NotificationSettings,
  phase: CyclePhase
): NotificationCopy {
  if (settings.privacy === 'discreet') return discreet(settings.tone);
  return PHASE_COPY[phase][settings.tone];
}

export function loggingReminderCopy(
  settings: NotificationSettings,
  cadence: LoggingCadence
): NotificationCopy {
  if (settings.privacy === 'discreet') return discreet(settings.tone);

  if (cadence === 'weekly') {
    return {
      title: pick(settings.tone, 'Weekly check-in', 'How was your week?', 'Weekly log'),
      body: pick(
        settings.tone,
        "A minute to log this week's symptoms and mood keeps your insights accurate.",
        'A tiny check-in? Log how your week felt and keep your insights accurate. 💕',
        "Record this week's symptoms and mood in PrivateCycle."
      ),
    };
  }

  return {
    title: pick(settings.tone, 'A minute for you', 'A tiny check-in?', 'Daily log'),
    body: pick(
      settings.tone,
      "Log today's symptoms or mood to keep your insights accurate.",
      'How are you feeling today? A minute in PrivateCycle keeps your insights accurate. 💕',
      "Record today's symptoms and mood in PrivateCycle."
    ),
  };
}

export function backupReminderCopy(settings: NotificationSettings): NotificationCopy {
  if (settings.privacy === 'discreet') return discreet(settings.tone);

  return {
    title: pick(settings.tone, 'Keep your data safe', 'A little backup?', 'Backup reminder'),
    body: pick(
      settings.tone,
      'Your data lives only on this device. Export a backup when you have a minute.',
      'Your data is only on this phone. Save a backup so it stays safe. 💕',
      'No recent saved backup found. Export one from Settings.'
    ),
  };
}

export function weeklySummaryCopy(settings: NotificationSettings): NotificationCopy {
  if (settings.privacy === 'discreet') return discreet(settings.tone);

  return {
    title: pick(settings.tone, 'Your week in review', 'Your weekly check-in ✨', 'Weekly summary'),
    body: pick(
      settings.tone,
      'Your latest patterns and phase tips are ready in Insights.',
      'See what your log is telling you this week in Insights. 💕',
      'Review your weekly cycle insights in PrivateCycle.'
    ),
  };
}

/** The sample shown on the setup and settings screens. */
export function previewNotificationCopy(settings: NotificationSettings): NotificationCopy {
  return periodReminderCopy(settings, settings.periodLeadDays);
}

export const TONE_LABELS: Record<NotificationTone, string> = {
  friendly: 'Friendly',
  girly: 'Girly',
  formal: 'Formal',
};

export const TONE_DESCRIPTIONS: Record<NotificationTone, string> = {
  friendly: 'Warm and plain-spoken.',
  girly: 'Soft, playful and affectionate.',
  formal: 'Neutral, short and no-nonsense.',
};

export const PRIVACY_LABELS = {
  discreet: 'Discreet',
  detailed: 'Detailed',
} as const;

export const PRIVACY_DESCRIPTIONS = {
  discreet: 'Neutral lock-screen text. Open the app for details.',
  detailed:
    'Show period and fertility wording; lock-screen previews depend on your system settings.',
} as const;
