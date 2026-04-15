import { useEffect, useMemo, useState } from 'react';
import { WEEKDAYS } from '../constants/calendar';
import { formatTimeLabel } from '../utils/date';

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
export default function Dashboard({ user, coursesByDay, onUpdatePreferences, loading }) {
  const [byDay, setByDay] = useState({});
  const [courseFilter, setCourseFilter] = useState('');

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

  return (
    <form className="rounded-md border border-slate-200 bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
      <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Lesson preferences</h2>
          <p className="text-sm text-slate-600">
            Pick one or more exact lesson slots for each weekday. The automation will book the matching time.
          </p>
        </div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {selectedCount} slot{selectedCount === 1 ? '' : 's'} selected
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
                        <div className={`text-xs ${checked ? 'text-white/80' : 'text-slate-500'}`}>
                          {formatTimeLabel(slot.lesson_start_time)}
                          {slot.lesson_end_time ? ` - ${formatTimeLabel(slot.lesson_end_time)}` : ''}
                        </div>
                      </div>
                      <span className={`ml-3 shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ${
                        checked ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {slot.date || day}
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
  );
}
