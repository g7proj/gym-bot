import { MONTH_LABELS, WEEKDAY_LABELS } from '../constants/calendar';

// Convert a YYYY-MM-DD string into a Date object, treating it as local time.
export function parseLocalDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Format a Date object into a YYYY-MM-DD string, treating it as local time.
export function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

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

// Local YYYY-MM-DD string for selecting the current day.
export function getTodayIsoLocal() {
  return new Date().toLocaleDateString('en-CA');
}

// Format a time string for compact UI display.
export function formatTimeLabel(timeStr) {
  if (!timeStr) return '';
  const text = String(timeStr).trim();
  if (!text) return '';
  if (text.includes('T')) {
    const [, timePart] = text.split('T');
    return (timePart || text).slice(0, 5);
  }
  const parts = text.split(':');
  if (parts.length < 2) return text;
  return `${parts[0]}:${parts[1]}`;
}
