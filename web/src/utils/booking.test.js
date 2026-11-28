import { describe, expect, test } from 'vitest';
import { bookingKey, lessonOccurrenceKey } from './booking';

describe('bookingKey', () => {
  test('normalizes service casing and ISO time fragments into a stable key', () => {
    const fromCalendar = bookingKey({
      date: '2026-05-20',
      service: 'PILATES',
      startTime: '18:00',
      endTime: '19:00',
    });

    const fromMyBookings = bookingKey({
      date: '2026-05-20',
      service: 'pilates',
      startTime: '2026-05-20T18:00:00',
      endTime: '2026-05-20T19:00:00',
    });

    expect(fromCalendar).toBe('2026-05-20|pilates|18:00|19:00');
    expect(fromMyBookings).toBe(fromCalendar);
  });

  test('lessonOccurrenceKey scopes recurring idLesson values by date and start time', () => {
    const week1 = lessonOccurrenceKey({
      date: '2026-05-14',
      idLesson: 101,
      startTime: '18:00',
    });
    const week2 = lessonOccurrenceKey({
      date: '2026-05-21',
      idLesson: 101,
      startTime: '2026-05-21T18:00:00',
    });

    expect(week1).toBe('2026-05-14|101|18:00');
    expect(week2).toBe('2026-05-21|101|18:00');
    expect(week1).not.toBe(week2);
    expect(lessonOccurrenceKey({ date: '2026-05-14', idLesson: 0 })).toBeNull();
  });
});
