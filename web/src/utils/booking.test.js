import { bookingKey } from './booking';

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
});
