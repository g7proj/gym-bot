import { useEffect, useMemo, useState } from 'react';
import { WEEKDAYS } from '../constants/calendar';
import { formatShortDate, formatTimeLabel } from '../utils/date';

const STATUS_META = {
  completed: {
    label: 'Completed',
    badgeClass: 'bg-success-soft text-success-deep',
  },
  failed: {
    label: 'Failed',
    badgeClass: 'bg-danger-soft text-danger-deep',
  },
  in_progress: {
    label: 'In progress',
    badgeClass: 'bg-warning-soft text-warning-deep',
  },
};

function formatRunTimestamp(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getStatusMeta(status) {
  return STATUS_META[status] || {
    label: status || 'Unknown',
    badgeClass: 'bg-slate-100 text-slate-600',
  };
}

function normalizeSlot(slot) {
  if (!slot) return null;
  const course = String(slot.course || slot.course_label || '').trim().toLowerCase();
  const lessonStartTime = String(slot.lesson_start_time || '').trim();
  if (!course || !lessonStartTime) return null;
  return {
    course,
    lesson_start_time: lessonStartTime,
  };
}

function slotKey(slot) {
  return `${slot.course}__${slot.lesson_start_time}`;
}

function displayCourse(slot) {
  return slot.course_label || slot.course || '';
}

// Preferences editor for selecting exact lesson slots per weekday.
export default function Dashboard({
  user,
  coursesByDay,
  bookingRuns = [],
  onRefreshStatus,
  onUpdatePreferences,
  loading,
}) {
  const [byDay, setByDay] = useState({});
  const [courseFilter, setCourseFilter] = useState('');
  const [calendarFilter, setCalendarFilter] = useState('all');

  useEffect(() => {
    const normalized = {};
    WEEKDAYS.forEach((day) => {
      const values = user?.preferences?.by_day?.[day] || [];
      normalized[day] = Array.isArray(values)
        ? values.map(normalizeSlot).filter(Boolean)
        : [];
    });
    setByDay(normalized);
  }, [user]);

  const toggleSlotForDay = (day, slot) => {
    const normalizedSlot = normalizeSlot(slot);
    if (!normalizedSlot) return;

    setByDay((prev) => {
      const current = prev[day] || [];
      const key = slotKey(normalizedSlot);
      const next = current.some((item) => slotKey(item) === key)
        ? current.filter((item) => slotKey(item) !== key)
        : [...current, normalizedSlot];
      return { ...prev, [day]: next };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onUpdatePreferences({ by_day: byDay });
  };

  const hasCourses = Object.values(coursesByDay || {}).some((items) => (items || []).length > 0);
  const filterValue = courseFilter.trim().toLowerCase();

  const selectedCount = useMemo(
    () => Object.values(byDay).reduce((total, slots) => total + (slots || []).length, 0),
    [byDay],
  );

  const latestRun = bookingRuns.length > 0 ? bookingRuns[0] : null;
  const latestMeta = latestRun ? getStatusMeta(latestRun.status) : null;
  const latestRunDate = latestRun?.run_date
    ? formatShortDate(String(latestRun.run_date).slice(0, 10))
    : '';
  const latestRunTime = latestRun ? formatRunTimestamp(latestRun.locked_at) : '';

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold">Automated booking status</h2>
            <p className="text-xs text-slate-500">
              Morning job runs daily from 07:00 (Europe/Rome).
            </p>
          </div>
          {onRefreshStatus && (
            <button
              type="button"
              onClick={onRefreshStatus}
              className="self-start rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 md:self-auto"
            >
              Refresh status
            </button>
          )}
        </div>

        {!latestRun ? (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            No automated booking runs recorded yet.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-md px-2 py-1 font-semibold ${latestMeta.badgeClass}`}>
                {latestMeta.label}
              </span>
              <span className="font-medium text-slate-700">
                {latestRunDate}
                {latestRunTime ? ` at ${latestRunTime}` : ''}
              </span>
            </div>
            {latestRun.error ? (
              <div className="rounded-md border border-rose-200 bg-danger-soft/60 px-3 py-2 text-xs text-danger-deep">
                {latestRun.error}
              </div>
            ) : null}
            {bookingRuns.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-500">
                <span className="font-semibold uppercase tracking-wide">Recent:</span>
                {bookingRuns.slice(1).map((run) => {
                  const meta = getStatusMeta(run.status);
                  const labelDate = run?.run_date
                    ? formatShortDate(String(run.run_date).slice(0, 10))
                    : '';
                  return (
                    <span
                      key={run.run_date}
                      className={`rounded-md px-2 py-0.5 font-medium ${meta.badgeClass}`}
                    >
                      {labelDate} · {meta.label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <form className="rounded-md border border-slate-200 bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
      <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Lesson preferences</h2>
          <p className="text-sm text-slate-600">
            Pick one or more exact lesson slots for each weekday. The automation will book the matching time.
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {selectedCount} slot{selectedCount === 1 ? '' : 's'} selected
          </div>
          
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <button
              type="button"
              onClick={() => setCalendarFilter('all')}
              className={`rounded-md px-3 py-1 text-[11px] font-semibold ${
                calendarFilter === 'all' ? 'bg-white text-slate-700 shadow' : 'text-slate-500'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setCalendarFilter('mine')}
              className={`rounded-md px-3 py-1 text-[11px] font-semibold ${
                calendarFilter === 'mine' ? 'bg-white text-slate-700 shadow' : 'text-slate-500'
              }`}
            >
              My bookings
            </button>
          </div>
        </div>
      </div>

      <div className="mb-5">
        <label className="block text-sm font-medium text-slate-700" htmlFor="courseFilter">
          Search lessons
        </label>
        <input
          id="courseFilter"
          type="text"
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
          placeholder="Search by course or time"
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
        />
      </div>

      {!hasCourses && (
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          No lessons found for this week. Try refreshing.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {WEEKDAYS.map((day) => {
          const daySlots = (coursesByDay[day] || []).filter((slot) => {
            if (calendarFilter === 'mine') {
              const selected = byDay[day] || [];
              const isSelected = selected.some((item) => slotKey(item) === slotKey(normalizeSlot(slot)));
              if (!isSelected) return false;
            }
            if (!filterValue) return true;
            const haystack = [slot.course_label, slot.course, slot.lesson_start_time, slot.lesson_end_time]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            return haystack.includes(filterValue);
          });

          const selectedSlots = byDay[day] || [];

          return (
            <div key={day} className="rounded-md border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-700">
                  {day.charAt(0).toUpperCase() + day.slice(1)}
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {selectedSlots.length} selected
                </div>
              </div>

              <div className="space-y-2">
                {daySlots.map((slot) => {
                  const normalizedSlot = normalizeSlot(slot);
                  if (!normalizedSlot) return null;
                  const checked = selectedSlots.some((item) => slotKey(item) === slotKey(normalizedSlot));
                  return (
                    <button
                      key={`${day}-${slotKey(normalizedSlot)}`}
                      type="button"
                      onClick={() => toggleSlotForDay(day, slot)}
                      className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
                        checked
                          ? 'border-brand bg-brand text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold">
                          {displayCourse(slot)}
                        </div>
                      </div>
                      <span className={`ml-3 shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ${
                        checked ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                          {formatTimeLabel(slot.lesson_start_time)}
                          {slot.lesson_end_time ? ` - ${formatTimeLabel(slot.lesson_end_time)}` : ''}
                      </span>
                    </button>
                  );
                })}
                {daySlots.length === 0 && (
                  <span className="text-sm text-slate-500">No lessons</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark disabled:opacity-60"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Updating...' : 'Update Preferences'}
        </button>
      </div>
    </form>
    </div>
  );
}
