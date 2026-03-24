export const WEEKDAY_EN = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function formatLocalIsoSeconds(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function getRollingWeekWindow(days = 7): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days - 1);
  end.setHours(23, 59, 59, 0);
  return { start, end };
}

export function getDailyTimeWindow(): { start: Date; end: Date } {
  const today = new Date();
  const start = new Date(today);
  start.setHours(7, 0, 0, 0);
  const end = new Date(today);
  end.setHours(23, 59, 59, 0);
  return { start, end };
}

export function parseApiDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function weekdayName(date: Date): string | null {
  const jsDay = date.getDay();
  const mondayIndex = (jsDay + 6) % 7;
  return WEEKDAY_EN[mondayIndex] || null;
}
