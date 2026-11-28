import { useEffect, useMemo, useState } from 'react';
import { WEEKDAYS, WEEKDAY_LABELS } from '../constants/calendar';
import { formatShortDate, formatTimeLabel } from '../utils/date';

const STATUS_META = {
  completed: {
    label: 'Completed',
    dotClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  failed: {
    label: 'Failed',
    dotClass: 'bg-rose-500',
    badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  },
  in_progress: {
    label: 'In progress',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
};

function normalizeTimeFull(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.includes('T')) {
    const [, timePart] = text.split('T');
    return normalizeTimeFull(timePart);
  }
  return text.length === 5 ? `${text}:00` : text;
}

function normalizeSlot(slot) {
  if (!slot) return null;
  const course = String(slot.course || slot.course_label || '').trim().toLowerCase();
  const lessonStartTime = normalizeTimeFull(slot.lesson_start_time);
  if (!course || !lessonStartTime) return null;
  return {
    course,
    lesson_start_time: lessonStartTime,
  };
}

function slotKey(slot) {
  return `${slot.course}__${normalizeTimeFull(slot.lesson_start_time)}`;
}

function buildNormalizedByDay(sourceByDay) {
  const normalized = {};
  WEEKDAYS.forEach((day) => {
    const values = sourceByDay?.[day] || [];
    normalized[day] = Array.isArray(values)
      ? values.map(normalizeSlot).filter(Boolean)
      : [];
  });
  return normalized;
}

function serializeByDay(map) {
  return WEEKDAYS.map((day) => {
    const keys = (map?.[day] || []).map(slotKey).sort();
    return `${day}:${keys.join(',')}`;
  }).join('|');
}

function formatRunTimestamp(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getStatusMeta(status) {
  return STATUS_META[status] || {
    label: status || 'Unknown',
    dotClass: 'bg-slate-400',
    badgeClass: 'bg-slate-200/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  };
}

// Compact mobile-first preferences editor for selecting exact weekly lesson slots.
export default function Dashboard({
  user,
  coursesByDay,
  bookingRuns = [],
  onRefreshStatus,
  onRefreshCourses,
  onUpdatePreferences,
  loading,
}) {
  const savedByDay = useMemo(
    () => buildNormalizedByDay(user?.preferences?.by_day),
    [user],
  );

  const [byDay, setByDay] = useState(savedByDay);
  const [courseFilter, setCourseFilter] = useState('');
  const [selectionFilter, setSelectionFilter] = useState('all');
  const [activeDay, setActiveDay] = useState('all');
  const [showRunHistory, setShowRunHistory] = useState(false);

  useEffect(() => {
    setByDay(savedByDay);
  }, [savedByDay]);

  const isDirty = useMemo(
    () => serializeByDay(byDay) !== serializeByDay(savedByDay),
    [byDay, savedByDay],
  );

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

  const handleReset = () => {
    setByDay(savedByDay);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onUpdatePreferences({ by_day: byDay });
  };

  // Merge available weekly courses with any saved ("orphan") slots not scheduled this week.
  const mergedSlotsByDay = useMemo(() => {
    const result = {};
    WEEKDAYS.forEach((day) => {
      const scheduled = Array.isArray(coursesByDay?.[day]) ? coursesByDay[day] : [];
      const seen = new Set();
      const combined = [];

      scheduled.forEach((slot) => {
        const normalized = normalizeSlot(slot);
        if (!normalized) return;
        const key = slotKey(normalized);
        if (seen.has(key)) return;
        seen.add(key);
        combined.push({
          ...slot,
          course: normalized.course,
          lesson_start_time: normalized.lesson_start_time,
          isOrphan: false,
        });
      });

      (byDay[day] || []).forEach((savedSlot) => {
        const normalized = normalizeSlot(savedSlot);
        if (!normalized) return;
        const key = slotKey(normalized);
        if (seen.has(key)) return;
        seen.add(key);
        combined.push({
          weekday: day,
          course: normalized.course,
          course_label: normalized.course.toUpperCase(),
          lesson_start_time: normalized.lesson_start_time,
          lesson_end_time: '',
          isOrphan: true,
        });
      });

      combined.sort((a, b) =>
        String(a.lesson_start_time).localeCompare(String(b.lesson_start_time))
        || String(a.course_label || a.course).localeCompare(String(b.course_label || b.course)),
      );
      result[day] = combined;
    });
    return result;
  }, [coursesByDay, byDay]);

  const hasAnySlots = useMemo(
    () => Object.values(mergedSlotsByDay).some((items) => items.length > 0),
    [mergedSlotsByDay],
  );

  const selectedCount = useMemo(
    () => Object.values(byDay).reduce((total, slots) => total + (slots || []).length, 0),
    [byDay],
  );

  const filterValue = courseFilter.trim().toLowerCase();
  const visibleWeekdays = activeDay === 'all' ? WEEKDAYS : [activeDay];

  const latestRun = bookingRuns.length > 0 ? bookingRuns[0] : null;
  const latestMeta = latestRun ? getStatusMeta(latestRun.status) : null;
  const latestRunDate = latestRun?.run_date
    ? formatShortDate(String(latestRun.run_date).slice(0, 10))
    : '';
  const latestRunTime = latestRun ? formatRunTimestamp(latestRun.locked_at) : '';

  return (
    <div className="space-y-3">
      {/* Compact single-bar Automated Booking Status */}
      <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-slate-800 dark:text-slate-100">Auto-book 07:01</span>
            {!latestRun ? (
              <span className="text-slate-500 dark:text-slate-400">No runs recorded yet</span>
            ) : (
              <>
                <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-semibold ${latestMeta.badgeClass}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${latestMeta.dotClass}`} />
                  {latestMeta.label}
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {latestRunDate}
                  {latestRunTime ? ` · ${latestRunTime}` : ''}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {bookingRuns.length > 1 && (
              <button
                type="button"
                onClick={() => setShowRunHistory((prev) => !prev)}
                className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                {showRunHistory ? 'Hide history' : 'History'}
              </button>
            )}
            {onRefreshStatus && (
              <button
                type="button"
                onClick={onRefreshStatus}
                aria-label="Refresh status"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6M16.5 3.5v3.2h-3.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {latestRun?.error && (
          <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {latestRun.error}
          </div>
        )}

        {showRunHistory && bookingRuns.length > 1 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 text-[11px] dark:border-slate-800">
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

      {/* Preferences form */}
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {/* Header + actions */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Weekly lesson slots
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {selectedCount} {selectedCount === 1 ? 'slot' : 'slots'} selected for automatic booking
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="inline-flex items-center rounded-lg border border-slate-200/80 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-800/80">
                <button
                  type="button"
                  onClick={() => setSelectionFilter('all')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    selectionFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectionFilter('selected')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    selectionFilter === 'selected'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Selected
                </button>
              </div>

              {onRefreshCourses && (
                <button
                  type="button"
                  onClick={onRefreshCourses}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden="true">
                    <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6M16.5 3.5v3.2h-3.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="hidden sm:inline">Refresh courses</span>
                </button>
              )}
            </div>
          </div>

          {/* Compact search input */}
          <div className="relative mt-2.5">
            <input
              id="courseFilter"
              type="text"
              aria-label="Search lessons"
              placeholder="Filter by course name or time (e.g. pilates, 18:00)..."
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5 pr-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-950"
            />
            {courseFilter && (
              <button
                type="button"
                onClick={() => setCourseFilter('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                ×
              </button>
            )}
          </div>

          {/* Horizontal scrollable weekday pill strip */}
          <div className="no-scrollbar mt-2.5 flex items-center gap-1 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setActiveDay('all')}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                activeDay === 'all'
                  ? 'bg-brand text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              All days
            </button>
            {WEEKDAYS.map((day, idx) => {
              const count = (byDay[day] || []).length;
              const isActive = activeDay === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setActiveDay(day)}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    isActive
                      ? 'bg-brand text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{WEEKDAY_LABELS[idx]}</span>
                  {count > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-[10px] font-bold ${
                        isActive
                          ? 'bg-white/25 text-white'
                          : 'bg-brand/15 text-brand dark:bg-brand/25 dark:text-brand-light'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {!hasAnySlots && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            No lessons found for the upcoming schedule. Tap refresh to reload courses.
          </div>
        )}

        {/* Compact day cards */}
        <div className={`grid grid-cols-1 gap-3 ${activeDay === 'all' ? 'md:grid-cols-2' : ''}`}>
          {visibleWeekdays.map((day) => {
            const selectedSlots = byDay[day] || [];
            const daySlots = (mergedSlotsByDay[day] || []).filter((slot) => {
              const normalized = normalizeSlot(slot);
              if (!normalized) return false;
              if (selectionFilter === 'selected') {
                const isSelected = selectedSlots.some((item) => slotKey(item) === slotKey(normalized));
                if (!isSelected) return false;
              }
              if (!filterValue) return true;
              const haystack = [slot.course_label, slot.course, slot.lesson_start_time, slot.lesson_end_time]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
              return haystack.includes(filterValue);
            });

            if (selectionFilter === 'selected' && activeDay === 'all' && daySlots.length === 0) {
              return null;
            }

            return (
              <div
                key={day}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold capitalize text-slate-800 dark:text-slate-100">
                    {day}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                    {selectedSlots.length} selected
                  </span>
                </div>

                <div className="space-y-1">
                  {daySlots.map((slot) => {
                    const normalizedSlot = normalizeSlot(slot);
                    if (!normalizedSlot) return null;
                    const checked = selectedSlots.some((item) => slotKey(item) === slotKey(normalizedSlot));
                    return (
                      <button
                        key={`${day}-${slotKey(normalizedSlot)}`}
                        type="button"
                        onClick={() => toggleSlotForDay(day, slot)}
                        aria-pressed={checked}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                          checked
                            ? 'border-brand bg-brand text-white shadow-sm'
                            : 'border-slate-200/80 bg-slate-50/50 text-slate-800 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                              checked
                                ? 'border-white bg-white text-brand'
                                : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
                            }`}
                            aria-hidden="true"
                          >
                            {checked ? '✓' : ''}
                          </span>
                          <span className="truncate font-semibold">
                            {slot.course_label || slot.course}
                          </span>
                          {slot.isOrphan && (
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                checked
                                  ? 'bg-white/20 text-white'
                                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              }`}
                            >
                              Off-schedule
                            </span>
                          )}
                        </div>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 tabular-nums text-[11px] font-semibold ${
                            checked
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {formatTimeLabel(slot.lesson_start_time)}
                          {slot.lesson_end_time ? `–${formatTimeLabel(slot.lesson_end_time)}` : ''}
                        </span>
                      </button>
                    );
                  })}
                  {daySlots.length === 0 && (
                    <div className="py-2 text-xs text-slate-400 dark:text-slate-500">
                      No matching lessons.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sticky save bar on mobile/desktop whenever unsaved changes exist, plus static fallback */}
        <div
          className={`${
            isDirty
              ? 'sticky bottom-3 z-20 rounded-xl border border-brand/30 bg-white/95 p-2.5 shadow-lg backdrop-blur-md dark:border-brand/40 dark:bg-slate-900/95'
              : 'flex justify-end pt-1'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            {isDirty && (
              <span className="pl-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                Unsaved changes
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {isDirty && (
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={loading}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Reset
                </button>
              )}
              <button
                className="rounded-lg bg-brand px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
                type="submit"
                disabled={loading || !isDirty}
              >
                {loading ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
