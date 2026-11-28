import { describe, expect, test } from 'vitest';
import {
  formatDay,
  formatLocalDate,
  formatShortDate,
  formatTimeLabel,
  getTodayIsoLocal,
  monthLabel,
  parseLocalDate,
  weekdayLabel,
} from './date';

describe('date utilities', () => {
  test('parseLocalDate and formatLocalDate round-trip month boundaries without timezone shift', () => {
    const boundaryDates = [
      '2026-01-31',
      '2026-02-28',
      '2028-02-29',
      '2026-05-31',
      '2026-12-31',
    ];

    boundaryDates.forEach((iso) => {
      const parsed = parseLocalDate(iso);
      expect(formatLocalDate(parsed)).toBe(iso);
    });
  });

  test('formatShortDate and formatDay format YYYY-MM-DD strings', () => {
    expect(formatShortDate('2026-05-09')).toBe('09/05/26');
    expect(formatDay('2026-05-09')).toBe('9');
    expect(formatDay('2026-05-31')).toBe('31');
  });

  test('monthLabel and weekdayLabel map dates to Monday-first calendar labels', () => {
    expect(monthLabel('2026-05-01')).toBe('May 2026');
    expect(monthLabel('2026-12-15')).toBe('Dec 2026');
    // 2026-05-04 is a Monday; 2026-05-10 is a Sunday
    expect(weekdayLabel('2026-05-04')).toBe('Mon');
    expect(weekdayLabel('2026-05-10')).toBe('Sun');
    expect(weekdayLabel('invalid')).toBe('');
  });

  test('formatTimeLabel normalizes ISO timestamps and HH:MM:SS values to HH:MM', () => {
    expect(formatTimeLabel('1900-01-01T18:30:00')).toBe('18:30');
    expect(formatTimeLabel('07:15:00')).toBe('07:15');
    expect(formatTimeLabel('09:00')).toBe('09:00');
    expect(formatTimeLabel('')).toBe('');
    expect(formatTimeLabel(null)).toBe('');
  });

  test('getTodayIsoLocal returns a valid YYYY-MM-DD string', () => {
    expect(getTodayIsoLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
