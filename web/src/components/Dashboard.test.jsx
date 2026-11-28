import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Dashboard from './Dashboard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Dashboard (Preferences)', () => {
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

  const sampleCoursesByDay = {
    monday: [
      {
        weekday: 'monday',
        course: 'pilates',
        course_label: 'PILATES',
        lesson_start_time: '18:00:00',
        lesson_end_time: '19:00:00',
      },
      {
        weekday: 'monday',
        course: 'yoga',
        course_label: 'YOGA',
        lesson_start_time: '19:00:00',
        lesson_end_time: '20:00:00',
      },
    ],
    thursday: [
      {
        weekday: 'thursday',
        course: 'spinning',
        course_label: 'SPINNING',
        lesson_start_time: '20:00:00',
        lesson_end_time: '21:00:00',
      },
    ],
  };

  const sampleUser = {
    id: 'user-1',
    credentials: { username: 'mario' },
    preferences: {
      by_day: {
        monday: [{ course: 'pilates', lesson_start_time: '18:00:00' }],
        // Saved preference not scheduled in this week's coursesByDay ("orphan" slot):
        wednesday: [{ course: 'zumba', lesson_start_time: '17:30:00' }],
      },
    },
  };

  test('renders Auto-book status, orphan Off-schedule slots, and filters by Selected / weekday', () => {
    const bookingRuns = [
      {
        run_date: '2026-11-28',
        status: 'failed',
        locked_at: '2026-11-28T06:01:02Z',
        error: 'Portal timeout',
      },
      {
        run_date: '2026-11-27',
        status: 'completed',
        locked_at: '2026-11-27T06:01:01Z',
        error: null,
      },
    ];

    act(() => {
      root.render(
        <Dashboard
          user={sampleUser}
          coursesByDay={sampleCoursesByDay}
          bookingRuns={bookingRuns}
          onRefreshStatus={jest.fn()}
          onRefreshCourses={jest.fn()}
          onUpdatePreferences={jest.fn()}
          loading={false}
        />,
      );
    });

    expect(container.textContent).toContain('Auto-book 07:01');
    expect(container.textContent).toContain('Failed');
    expect(container.textContent).toContain('Portal timeout');
    expect(container.textContent).toContain('ZUMBA');
    expect(container.textContent).toContain('Off-schedule');
    expect(container.textContent).toContain('2 slots selected');

    // Filter to "Selected" only -> unselected YOGA and SPINNING disappear, PILATES and ZUMBA remain.
    const selectedBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent.trim() === 'Selected',
    );
    act(() => {
      selectedBtn.click();
    });

    expect(container.textContent).toContain('PILATES');
    expect(container.textContent).toContain('ZUMBA');
    expect(container.textContent).not.toContain('YOGA');
    expect(container.textContent).not.toContain('SPINNING');

    // Switch back to "All" and filter to Monday pill only -> Thursday card hidden.
    const allBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent.trim() === 'All',
    );
    const monPill = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent.startsWith('Mon'),
    );
    act(() => {
      allBtn.click();
      monPill.click();
    });

    expect(container.textContent).toContain('YOGA');
    expect(container.textContent).not.toContain('SPINNING');
  });

  test('tracks dirty state, supports Reset, and submits updated slots', () => {
    const onUpdatePreferences = jest.fn();

    act(() => {
      root.render(
        <Dashboard
          user={sampleUser}
          coursesByDay={sampleCoursesByDay}
          bookingRuns={[]}
          onRefreshStatus={jest.fn()}
          onRefreshCourses={jest.fn()}
          onUpdatePreferences={onUpdatePreferences}
          loading={false}
        />,
      );
    });

    const getSaveBtn = () =>
      Array.from(container.querySelectorAll('button')).find(
        (btn) => btn.textContent.trim() === 'Save Preferences',
      );

    expect(getSaveBtn().disabled).toBe(true);
    expect(container.textContent).not.toContain('Unsaved changes');

    // Toggle YOGA on Monday -> dirty state activates.
    const yogaBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent.includes('YOGA'),
    );
    act(() => {
      yogaBtn.click();
    });

    expect(container.textContent).toContain('Unsaved changes');
    expect(getSaveBtn().disabled).toBe(false);

    // Reset restores original selection and clears dirty state.
    const resetBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent.trim() === 'Reset',
    );
    act(() => {
      resetBtn.click();
    });
    expect(getSaveBtn().disabled).toBe(true);

    // Deselect orphan ZUMBA slot and submit form.
    const zumbaBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent.includes('ZUMBA'),
    );
    act(() => {
      zumbaBtn.click();
    });
    expect(getSaveBtn().disabled).toBe(false);

    const form = container.querySelector('form');
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onUpdatePreferences).toHaveBeenCalledTimes(1);
    const payload = onUpdatePreferences.mock.calls[0][0];
    expect(payload.by_day.monday).toEqual([{ course: 'pilates', lesson_start_time: '18:00:00' }]);
    expect(payload.by_day.wednesday).toEqual([]);
  });
});
