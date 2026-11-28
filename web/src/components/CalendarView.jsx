import { useEffect, useMemo, useState } from 'react';
import { WEEKDAY_LABELS } from '../constants/calendar';
import { bookingKey, lessonOccurrenceKey } from '../utils/booking';
import {
  formatDay,
  formatLocalDate,
  formatShortDate,
  getTodayIsoLocal,
  monthLabel,
  parseLocalDate,
  weekdayLabel,
} from '../utils/date';

// Mobile-first compact calendar view that merges class availability with active user bookings.
export default function CalendarView({
  days,
  meta,
  myBookings,
  selectedDate,
  onSelectDate,
  onRefresh,
  onBook,
  onCancel,
}) {
  const hasDays = Array.isArray(days) && days.length > 0;
  const [calendarFilter, setCalendarFilter] = useState('all');
  const [activeMonthIdx, setActiveMonthIdx] = useState(0);

  const todayIso = useMemo(() => getTodayIsoLocal(), []);
  const groupedDays = useMemo(() => (Array.isArray(days) ? days : []), [days]);

  const myBookingsLookup = useMemo(() => {
    const byOccurrence = new Map();
    const byKey = new Map();
    (myBookings || []).forEach((item) => {
      const isActive = Boolean(item?.isUserPresent) || Number(item?.waitingListPosition ?? 0) > 0;
      if (!isActive) return;

      const occurrenceKey = lessonOccurrenceKey(item);
      if (occurrenceKey) {
        byOccurrence.set(occurrenceKey, item);
      }
      byKey.set(bookingKey(item), item);
    });
    return { byOccurrence, byKey };
  }, [myBookings]);

  const itemsByDate = useMemo(() => {
    const map = {};
    groupedDays.forEach((day) => {
      map[day.date] = (day.items || []).map((item) => {
        const occurrenceKey = lessonOccurrenceKey(item);
        const match = (occurrenceKey && myBookingsLookup.byOccurrence.get(occurrenceKey))
          || myBookingsLookup.byKey.get(bookingKey(item));
        if (!match) {
          return {
            ...item,
            bookingId: null,
            isUserPresent: false,
            waitingListPosition: 0,
          };
        }
        return {
          ...item,
          bookingId: match.bookingId,
          idLesson: match.idLesson || item.idLesson,
          type: match.type ?? item.type,
          idDurata: match.idDurata ?? item.idDurata,
          isUserPresent: Boolean(match.isUserPresent),
          waitingListPosition: Number(match.waitingListPosition ?? 0),
        };
      });
    });
    return map;
  }, [groupedDays, myBookingsLookup]);

  const visibleItemsByDate = useMemo(() => {
    if (calendarFilter === 'all') return itemsByDate;
    const map = {};
    Object.entries(itemsByDate).forEach(([date, items]) => {
      map[date] = (items || []).filter(
        (item) => item.isUserPresent || Number(item.waitingListPosition) > 0,
      );
    });
    return map;
  }, [itemsByDate, calendarFilter]);

  const dateList = useMemo(() => {
    if (!meta?.startDate || !meta?.endDate) return [];

    const start = parseLocalDate(meta.startDate);
    const endParsed = parseLocalDate(meta.endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(endParsed.getTime())) return [];

    // Compute last day of endParsed's month without day-of-month overflow.
    const end = new Date(endParsed.getFullYear(), endParsed.getMonth() + 1, 0);

    const list = [];
    const current = new Date(start);

    while (current <= end) {
      list.push(formatLocalDate(current));
      current.setDate(current.getDate() + 1);
    }

    return list;
  }, [meta]);

  const monthGroups = useMemo(() => {
    if (!dateList.length) return [];
    const groups = [];
    let currentLabel = null;
    let currentDates = [];
    dateList.forEach((date) => {
      const label = monthLabel(date);
      if (label !== currentLabel) {
        if (currentDates.length) {
          groups.push({ label: currentLabel, dates: currentDates });
        }
        currentLabel = label;
        currentDates = [];
      }
      currentDates.push(date);
    });
    if (currentDates.length) {
      groups.push({ label: currentLabel, dates: currentDates });
    }
    return groups;
  }, [dateList]);

  // Keep visible month synced with selectedDate when selectedDate changes.
  useEffect(() => {
    if (!selectedDate || !monthGroups.length) return;
    const idx = monthGroups.findIndex((group) => group.dates.includes(selectedDate));
    if (idx !== -1) {
      setActiveMonthIdx(idx);
    }
  }, [selectedDate, monthGroups]);

  const safeMonthIdx = monthGroups.length
    ? Math.min(activeMonthIdx, monthGroups.length - 1)
    : 0;
  const activeGroup = monthGroups[safeMonthIdx] || null;
  const selectedItems = selectedDate ? visibleItemsByDate[selectedDate] || [] : [];
  const canJumpToday = dateList.includes(todayIso) && selectedDate !== todayIso;

  const calendarCells = useMemo(() => {
    if (!activeGroup?.dates?.length) return [];
    const firstDay = parseLocalDate(activeGroup.dates[0]);
    const jsDay = firstDay.getDay();
    const mondayIndex = (jsDay + 6) % 7;
    const blanks = Array.from({ length: mondayIndex }, () => null);
    return [...blanks, ...activeGroup.dates];
  }, [activeGroup]);

  return (
    <div className="space-y-3">
      {/* Compact top control bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="inline-flex items-center rounded border border-slate-200/80 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => setCalendarFilter('all')}
            className={`rounded-sm px-2.5 py-1 text-xs font-semibold transition ${
              calendarFilter === 'all'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setCalendarFilter('mine')}
            className={`rounded-sm px-2.5 py-1 text-xs font-semibold transition ${
              calendarFilter === 'mine'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            My bookings
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {canJumpToday && (
            <button
              type="button"
              onClick={() => onSelectDate(todayIso)}
              className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Today
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh calendar"
            className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6M16.5 3.5v3.2h-3.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {!hasDays && (
        <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          No upcoming lessons found.
        </div>
      )}

      {/* Side-by-side on desktop, compact stacked single-month + immediate lesson list on mobile */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[330px_minmax(0,1fr)] lg:items-start">
        {/* Month card */}
        {activeGroup && (
          <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {/* Month switcher */}
            <div className="mb-2.5 flex items-center justify-between gap-1">
              {monthGroups.length > 1 ? (
                <div className="flex w-full items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveMonthIdx((idx) => Math.max(0, idx - 1))}
                    disabled={safeMonthIdx === 0}
                    aria-label="Previous month"
                    className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-600 transition hover:bg-slate-100 disabled:opacity-35 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    ‹
                  </button>
                  <div className="flex items-center gap-1">
                    {monthGroups.map((group, idx) => (
                      <button
                        key={group.label}
                        type="button"
                        onClick={() => setActiveMonthIdx(idx)}
                        className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                          idx === safeMonthIdx
                            ? 'bg-brand/10 text-brand dark:bg-brand-light/20 dark:text-brand-light'
                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                      >
                        {group.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveMonthIdx((idx) => Math.min(monthGroups.length - 1, idx + 1))}
                    disabled={safeMonthIdx >= monthGroups.length - 1}
                    aria-label="Next month"
                    className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-600 transition hover:bg-slate-100 disabled:opacity-35 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    ›
                  </button>
                </div>
              ) : (
                <div className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {activeGroup.label}
                </div>
              )}
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400 dark:text-slate-500">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="py-0.5">
                  {label}
                </div>
              ))}
            </div>

            {/* Compact calendar grid */}
            <div className="mt-1 grid grid-cols-7 gap-1">
              {calendarCells.map((date, index) => {
                if (!date) {
                  return <div key={`empty-${index}`} className="h-10 sm:h-11" />;
                }
                const items = visibleItemsByDate[date] || [];
                const booked = items.some((item) => item.isUserPresent);
                const waitingListItem = items.find((item) => Number(item.waitingListPosition) > 0);
                const hasWaitingList = Boolean(waitingListItem);
                const hasItems = items.length > 0;
                const isSelected = selectedDate === date;
                const isToday = todayIso === date;

                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => onSelectDate(date)}
                    className={`relative flex h-10 flex-col items-center justify-center rounded border text-xs font-semibold transition sm:h-11 ${
                      isSelected
                        ? 'border-brand bg-brand text-white shadow-sm'
                        : hasItems
                          ? 'border-slate-200/80 bg-white text-slate-800 hover:border-brand/50 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-brand-light/50'
                          : 'border-transparent bg-slate-100/70 text-slate-400 dark:bg-slate-900/40 dark:text-slate-600'
                    } ${isToday && !isSelected ? 'ring-1 ring-brand dark:ring-brand-light' : ''}`}
                  >
                    <span className="leading-none">{formatDay(date)}</span>
                    <span className="mt-1 flex h-2 items-center gap-1">
                      {booked && (
                        <span
                          title="Booked"
                          className={`h-1.5 w-1.5 rounded-full ${
                            isSelected ? 'bg-white' : 'bg-emerald-500'
                          }`}
                        />
                      )}
                      {hasWaitingList && (
                        <span
                          title={`WL #${waitingListItem.waitingListPosition}`}
                          className={`h-1.5 w-1.5 rounded-full ${
                            isSelected ? 'bg-amber-200' : 'bg-amber-500'
                          }`}
                        />
                      )}
                      {!booked && !hasWaitingList && hasItems && (
                        <span
                          className={`h-1 w-1 rounded-full ${
                            isSelected ? 'bg-white/70' : 'bg-slate-300 dark:bg-slate-600'
                          }`}
                        />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Compact legend */}
            <div className="mt-2.5 flex items-center justify-center gap-3 border-t border-slate-100 pt-2 text-[10px] font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Booked
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Waitlist
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                Available
              </span>
            </div>
          </div>
        )}

        {/* Selected day lessons panel */}
        <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4">
          <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-100 sm:text-sm">
              {selectedDate
                ? `${weekdayLabel(selectedDate)} · ${formatShortDate(selectedDate)}`
                : 'Select a date'}
            </div>
            {selectedDate && (
              <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {selectedItems.length} {selectedItems.length === 1 ? 'class' : 'classes'}
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            {selectedItems.map((item) => {
              const isBooked = Boolean(item.isUserPresent);
              const wlPos = Number(item.waitingListPosition ?? 0);
              const isWaitlisted = wlPos > 0;
              const isLocked = Number(item.isLocked ?? 0) === 1;
              const seats = Number(item.availablePlaces ?? 0);

              const accentBar = isBooked
                ? 'bg-emerald-500'
                : isWaitlisted
                  ? 'bg-amber-500'
                  : 'bg-slate-200 dark:bg-slate-700';

              return (
                <div
                  key={`${item.idLesson}-${item.startTime}`}
                  className="flex items-center justify-between gap-2 rounded border border-slate-200/80 bg-slate-50/50 px-2.5 py-2 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-slate-700"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`h-8 w-1 shrink-0 rounded-sm ${accentBar}`} aria-hidden="true" />
                    <div className="w-11 shrink-0 tabular-nums leading-tight">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        {item.startTime}
                      </div>
                      <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                        {item.endTime}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100 sm:text-sm">
                        {item.service}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>{seats > 0 ? `${seats} seats` : 'Full'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {isBooked && (
                      <span className="rounded-sm bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                        Booked
                      </span>
                    )}
                    {isWaitlisted && (
                      <span className="rounded-sm bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                        {`WL #${wlPos}`}
                      </span>
                    )}

                    {item.bookingId ? (
                      <button
                        type="button"
                        onClick={() => onCancel(item)}
                        className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                      >
                        Cancel
                      </button>
                    ) : !isBooked && !isWaitlisted ? (
                      isLocked ? (
                        <button
                          type="button"
                          disabled
                          className="cursor-not-allowed rounded border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-500"
                        >
                          Closed
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onBook(item)}
                          className="rounded bg-brand px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-dark"
                        >
                          {seats > 0 ? 'Book' : 'Join waitlist'}
                        </button>
                      )
                    ) : null}
                  </div>
                </div>
              );
            })}

            {selectedDate && selectedItems.length === 0 && (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No courses available.
              </div>
            )}
            {!selectedDate && (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                Pick a day to see the lessons.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
