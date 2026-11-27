// Time helpers used by the edge functions to build booking windows.
export const WEEKDAY_EN = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const DEFAULT_TIMEZONE = 'Europe/Rome';

// Create a Date that represents "now" in the given time zone.
function nowInTimeZone(timeZone = DEFAULT_TIMEZONE): Date {
  const locale = new Date().toLocaleString('en-US', { timeZone });
  return new Date(locale);
}

// Format a Date into local ISO-like string without timezone offset.
export function formatLocalIsoSeconds(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Normalize an API time string to HH:MM:SS for storage and comparison.
export function formatApiTime(timeStr: string | null | undefined): string | null {
  if (!timeStr) return null;
  const text = String(timeStr).trim();
  if (!text) return null;

  const isoMatch = text.match(/T(\d{2}:\d{2}:\d{2})/);
  if (isoMatch) return isoMatch[1];

  const plainMatch = text.match(/^(\d{2}:\d{2}:\d{2})/);
  if (plainMatch) return plainMatch[1];

  const shortMatch = text.match(/^(\d{2}:\d{2})/);
  if (shortMatch) return `${shortMatch[1]}:00`;

  return null;
}

// Build an inclusive window from start day 00:00 to end day 23:59:59.
export function getRollingWeekWindow(
  days = 7,
  startDate?: Date,
  timeZone = DEFAULT_TIMEZONE,
): { start: Date; end: Date } {
  const start = startDate ? new Date(startDate) : nowInTimeZone(timeZone);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days - 1);
  end.setHours(23, 59, 59, 0);
  return { start, end };
}

// Daily booking window (07:00 to 23:59) in the target time zone.
export function getDailyTimeWindow(
  baseDate?: Date,
  timeZone = DEFAULT_TIMEZONE,
): { start: Date; end: Date } {
  const day = baseDate ? new Date(baseDate) : nowInTimeZone(timeZone);
  const start = new Date(day);
  start.setHours(7, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 0);
  return { start, end };
}

// Defensive parse: returns null if the API date is missing or invalid.
export function parseApiDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

// Convert JS weekday (Sunday=0) to our Monday-first array.
export function weekdayName(date: Date): string | null {
  const jsDay = date.getDay();
  const mondayIndex = (jsDay + 6) % 7;
  return WEEKDAY_EN[mondayIndex] || null;
}

export interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  isoDate: string;
}

/**
 * Extract calendar date and 24-hour clock components in the target IANA time zone
 * using Intl.DateTimeFormat (immune to host OS timezone).
 */
export function getZonedParts(
  timeZone = DEFAULT_TIMEZONE,
  instant: Date = new Date(),
): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  // Some ICU builds emit "24" for midnight under h23; normalize to 0.
  const rawHour = Number(map.hour);
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(map.minute);
  const second = Number(map.second);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    isoDate: `${year}-${pad(month)}-${pad(day)}`,
  };
}

/** Add `days` to a `YYYY-MM-DD` calendar date without DST drift. */
export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

/** Resolve the lowercase English weekday (`monday`..`sunday`) for a `YYYY-MM-DD` date. */
export function weekdayFromIsoDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const mondayIndex = (utcDay + 6) % 7;
  return WEEKDAY_EN[mondayIndex];
}

/**
 * Build the 20-day InfoYou booking window (`today` .. `today + 19`) for automated runs.
 */
export function getBookingWindowStrings(todayIso: string): {
  startDate: string;
  endDate: string;
  timeStart: string;
  timeEnd: string;
  targetDate: string;
  targetWeekday: string;
} {
  const targetDate = addDaysIso(todayIso, 19);
  return {
    startDate: `${todayIso}T00:00:00`,
    endDate: `${targetDate}T00:00:00`,
    timeStart: `${todayIso}T07:00:00`,
    timeEnd: `${todayIso}T23:59:59`,
    targetDate,
    targetWeekday: weekdayFromIsoDate(targetDate),
  };
}
