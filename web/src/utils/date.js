import { MONTH_LABELS, WEEKDAY_LABELS } from '../constants/calendar';

// Format YYYY-MM-DD into a compact DD/MM/YY string for the UI.
export function formatShortDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}/${year.slice(2)}`;
}

// Extract the day-of-month number for calendar cells.
export function formatDay(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return String(Number(parts[2]));
}

// Build the "Mon YYYY" month label used in the calendar sidebar.
export function monthLabel(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const month = MONTH_LABELS[Number(parts[1]) - 1] || parts[1];
  return `${month} ${parts[0]}`;
}

// Convert a date string into the weekday label used in headers.
export function weekdayLabel(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const jsDay = date.getDay();
  const mondayIndex = (jsDay + 6) % 7;
  return WEEKDAY_LABELS[mondayIndex] || '';
}
