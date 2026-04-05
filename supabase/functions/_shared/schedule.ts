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
