import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import CalendarView from './CalendarView';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('CalendarView', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const sampleDays = [
    {
      date: '2026-05-20',
      items: [
        {
          idLesson: 101,
          idService: 10,
          date: '2026-05-20',
          startTime: '18:00',
          endTime: '19:00',
          service: 'PILATES',
          category: 'CORSI FIT',
          availablePlaces: 4,
          isUserPresent: false,
          waitingListPosition: 0,
        },
        {
          idLesson: 102,
          idService: 11,
          date: '2026-05-20',
          startTime: '19:00',
          endTime: '20:00',
          service: 'YOGA',
          category: 'CORSI FIT',
          availablePlaces: 0,
          isUserPresent: false,
          waitingListPosition: 0,
        },
        {
          idLesson: 103,
          idService: 12,
          date: '2026-05-20',
          startTime: '20:00',
          endTime: '21:00',
          service: 'SPINNING',
          category: 'CORSI FIT',
          availablePlaces: 6,
          isUserPresent: false,
          waitingListPosition: 0,
        },
      ],
    },
  ];

  const sampleMyBookings = [
    {
      bookingId: 9001,
      idLesson: 101,
      date: '2026-05-20',
      startTime: '18:00',
      endTime: '19:00',
      service: 'PILATES',
      isUserPresent: true,
      waitingListPosition: 0,
    },
    {
      bookingId: 9002,
      idLesson: 102,
      date: '2026-05-20',
      startTime: '19:00',
      endTime: '20:00',
      service: 'YOGA',
      isUserPresent: false,
      waitingListPosition: 2,
    },
  ];

  test('does not overflow 31-day end month into the following month', () => {
    act(() => {
      root.render(
        <CalendarView
          days={sampleDays}
          meta={{ startDate: '2026-05-01', endDate: '2026-05-31' }}
          myBookings={[]}
          selectedDate="2026-05-20"
          onSelectDate={jest.fn()}
          onRefresh={jest.fn()}
          onBook={jest.fn()}
          onCancel={jest.fn()}
        />,
      );
    });

    expect(container.textContent).toContain('May 2026');
    expect(container.textContent).not.toContain('Jun 2026');
  });

  test('merges myBookings, displays waitlist/booked badges, and filters My bookings', () => {
    const onSelectDate = jest.fn();
    const onBook = jest.fn();
    const onCancel = jest.fn();

    act(() => {
      root.render(
        <CalendarView
          days={sampleDays}
          meta={{ startDate: '2026-05-01', endDate: '2026-05-31' }}
          myBookings={sampleMyBookings}
          selectedDate="2026-05-20"
          onSelectDate={onSelectDate}
          onRefresh={jest.fn()}
          onBook={onBook}
          onCancel={onCancel}
        />,
      );
    });

    expect(container.textContent).toContain('PILATES');
    expect(container.textContent).toContain('WL #2');
    expect(container.textContent).toContain('SPINNING');

    // Switch filter to "My bookings" -> unbooked SPINNING class should be hidden.
    const myBookingsFilterBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'My bookings',
    );
    act(() => {
      myBookingsFilterBtn.click();
    });

    expect(container.textContent).toContain('PILATES');
    expect(container.textContent).toContain('YOGA');
    expect(container.textContent).not.toContain('SPINNING');

    // Clicking a calendar day button calls onSelectDate with YYYY-MM-DD.
    const day15Button = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent.trim() === '15',
    );
    act(() => {
      day15Button.click();
    });
    expect(onSelectDate).toHaveBeenCalledWith('2026-05-15');
  });

  test('does not leak booking status onto a canceled earlier week sharing the same recurring idLesson', () => {
    const recurringDays = [
      {
        date: '2026-05-14',
        items: [
          {
            idLesson: 101,
            idService: 10,
            date: '2026-05-14',
            startTime: '18:00',
            endTime: '19:00',
            service: 'PILATES',
            category: 'CORSI FIT',
            availablePlaces: 5,
            // Even if calendar still carried stale isUserPresent=true, myBookings is authoritative:
            isUserPresent: true,
            waitingListPosition: 0,
          },
        ],
      },
      {
        date: '2026-05-21',
        items: [
          {
            idLesson: 101,
            idService: 10,
            date: '2026-05-21',
            startTime: '18:00',
            endTime: '19:00',
            service: 'PILATES',
            category: 'CORSI FIT',
            availablePlaces: 3,
            isUserPresent: true,
            waitingListPosition: 0,
          },
        ],
      },
    ];

    // Only 2026-05-21 remains booked in myBookings; 2026-05-14 was canceled.
    const bookingsAfterCancel = [
      {
        bookingId: 9999,
        idLesson: 101,
        date: '2026-05-21',
        startTime: '18:00',
        endTime: '19:00',
        service: 'PILATES',
        isUserPresent: true,
        waitingListPosition: 0,
      },
    ];

    act(() => {
      root.render(
        <CalendarView
          days={recurringDays}
          meta={{ startDate: '2026-05-01', endDate: '2026-05-31' }}
          myBookings={bookingsAfterCancel}
          selectedDate="2026-05-14"
          onSelectDate={jest.fn()}
          onRefresh={jest.fn()}
          onBook={jest.fn()}
          onCancel={jest.fn()}
        />,
      );
    });

    // Selected canceled day (2026-05-14) should show Book, not Cancel, and disappear in "My bookings".
    const buttonsAll = Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
    expect(buttonsAll).toContain('Book');
    expect(buttonsAll).not.toContain('Cancel');

    const myBookingsFilterBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'My bookings',
    );
    act(() => {
      myBookingsFilterBtn.click();
    });

    expect(container.textContent).toContain('No courses available.');
  });
});
