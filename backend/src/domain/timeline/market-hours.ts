const MARKET_TIME_ZONE = 'America/New_York';
const MARKET_OPEN_MINUTES = 9 * 60 + 30;
const MARKET_CLOSE_MINUTES = 16 * 60;

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

interface EasternClock {
  weekday: number;
  hour: number;
  minute: number;
}

function getEasternClock(at: Date): EasternClock {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(at);
  const weekdayStr = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');

  return {
    weekday: WEEKDAY_MAP[weekdayStr] ?? 0,
    hour,
    minute,
  };
}

export function isUsStockMarketOpen(at: Date = new Date()): boolean {
  const { weekday, hour, minute } = getEasternClock(at);

  if (weekday === 0 || weekday === 6) {
    return false;
  }

  const nowMinutes = hour * 60 + minute;
  return nowMinutes >= MARKET_OPEN_MINUTES && nowMinutes < MARKET_CLOSE_MINUTES;
}

export function describeUsMarketSession(at: Date = new Date()): string {
  const { weekday, hour, minute } = getEasternClock(at);
  const clock = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ET`;

  if (isUsStockMarketOpen(at)) {
    return `US regular session open (${clock}, weekday ${weekday})`;
  }

  return `US market closed (${clock}, weekday ${weekday}; regular hours 9:30 AM–4:00 PM ET Mon–Fri)`;
}

export function isUsMarketWeekday(at: Date = new Date()): boolean {
  const { weekday } = getEasternClock(at);
  return weekday >= 1 && weekday <= 5;
}

export interface UsMarketDayWindow {
  tradingDay: string;
  windowStart: string;
  windowEnd: string;
}

function getEasternDateKey(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MARKET_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

function matchesEasternDate(at: Date, dateKey: string): boolean {
  return getEasternDateKey(at) === dateKey;
}

function easternWallTimeToUtc(dateKey: string, hour: number, minute: number): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  let utc = Date.UTC(year, month - 1, day, hour + 5, minute);

  for (let attempt = 0; attempt < 8; attempt++) {
    const clock = getEasternClock(new Date(utc));

    if (
      matchesEasternDate(new Date(utc), dateKey) &&
      clock.hour === hour &&
      clock.minute === minute
    ) {
      return utc;
    }

    const targetMinutes = hour * 60 + minute;
    const currentMinutes = clock.hour * 60 + clock.minute;
    utc += (targetMinutes - currentMinutes) * 60_000;
  }

  return utc;
}

export function getUsMarketDayWindow(at: Date = new Date()): UsMarketDayWindow | null {
  if (!isUsMarketWeekday(at)) {
    return null;
  }

  const tradingDay = getEasternDateKey(at);
  const windowStart = new Date(
    easternWallTimeToUtc(tradingDay, 9, 30)
  ).toISOString();
  const windowEnd = new Date(
    easternWallTimeToUtc(tradingDay, 16, 0)
  ).toISOString();

  return { tradingDay, windowStart, windowEnd };
}
