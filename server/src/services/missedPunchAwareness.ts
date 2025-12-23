import { PunchEvent } from '@shared/schema';
import { deriveLaborIntervals, LaborInterval } from './laborSummary';

export type AwarenessState = 'looks_good' | 'possible_missed_punch' | 'open_punch_today';

export interface PunchAwareness {
  state: AwarenessState;
  message: string | null;
  actionText: string | null;
  openPunchTime: Date | null;
  hoursOpen: number | null;
}

export interface AwarenessConfig {
  openPunchThresholdHours: number;
  workdayEndHour: number;
}

const DEFAULT_CONFIG: AwarenessConfig = {
  openPunchThresholdHours: 10,
  workdayEndHour: 18,
};

const GENTLE_MESSAGES = {
  open_punch_today: [
    "It looks like you may have an open punch from earlier today.",
    "Just a heads up — you might still be clocked in.",
    "You might want to double-check your time today.",
  ],
  possible_missed_punch: [
    "Something looks a little off with your recent punches.",
    "Just a heads up — there may be a missing punch.",
    "You might want to review your recent time entries.",
  ],
};

function getRandomMessage(messages: string[]): string {
  return messages[Math.floor(Math.random() * messages.length)];
}

function isClockIn(punchType: string): boolean {
  return punchType === 'clock_in' || punchType === 'IN' || punchType === 'in';
}

function isClockOut(punchType: string): boolean {
  return punchType === 'clock_out' || punchType === 'OUT' || punchType === 'out';
}

export function detectConsecutivePunches(punches: PunchEvent[]): boolean {
  if (punches.length < 2) return false;
  
  const sorted = [...punches].sort(
    (a, b) => new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime()
  );
  
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    
    if (
      (isClockIn(prev.punchType) && isClockIn(curr.punchType)) ||
      (isClockOut(prev.punchType) && isClockOut(curr.punchType))
    ) {
      return true;
    }
  }
  
  return false;
}

export function detectOpenPunch(
  punches: PunchEvent[],
  config: AwarenessConfig = DEFAULT_CONFIG
): LaborInterval | null {
  const intervals = deriveLaborIntervals(punches);
  const openIntervals = intervals.filter(i => i.isOpen);
  
  if (openIntervals.length === 0) return null;
  
  const mostRecent = openIntervals[openIntervals.length - 1];
  const now = new Date();
  const hoursSinceClockIn = (now.getTime() - mostRecent.clockIn.getTime()) / (1000 * 60 * 60);
  
  if (hoursSinceClockIn > config.openPunchThresholdHours) {
    return mostRecent;
  }
  
  return mostRecent;
}

export function evaluatePunchAwareness(
  punches: PunchEvent[],
  config: AwarenessConfig = DEFAULT_CONFIG
): PunchAwareness {
  if (punches.length === 0) {
    return {
      state: 'looks_good',
      message: null,
      actionText: null,
      openPunchTime: null,
      hoursOpen: null,
    };
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  
  const todayPunches = punches.filter(
    p => new Date(p.punchTime) >= todayStart
  );

  if (detectConsecutivePunches(todayPunches)) {
    return {
      state: 'possible_missed_punch',
      message: getRandomMessage(GENTLE_MESSAGES.possible_missed_punch),
      actionText: 'Open Time Clock to review',
      openPunchTime: null,
      hoursOpen: null,
    };
  }

  const openPunch = detectOpenPunch(todayPunches, config);
  
  if (openPunch) {
    const hoursOpen = (now.getTime() - openPunch.clockIn.getTime()) / (1000 * 60 * 60);
    
    if (hoursOpen > config.openPunchThresholdHours) {
      return {
        state: 'possible_missed_punch',
        message: getRandomMessage(GENTLE_MESSAGES.possible_missed_punch),
        actionText: 'Open Time Clock to review',
        openPunchTime: openPunch.clockIn,
        hoursOpen: Math.round(hoursOpen * 10) / 10,
      };
    }
    
    return {
      state: 'open_punch_today',
      message: getRandomMessage(GENTLE_MESSAGES.open_punch_today),
      actionText: 'Open Time Clock to review',
      openPunchTime: openPunch.clockIn,
      hoursOpen: Math.round(hoursOpen * 10) / 10,
    };
  }

  return {
    state: 'looks_good',
    message: null,
    actionText: null,
    openPunchTime: null,
    hoursOpen: null,
  };
}
