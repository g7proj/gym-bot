import { useMemo, useState } from 'react';
import { WEEKDAY_LABELS } from '../constants/calendar';
import { bookingKey } from '../utils/booking';
import { formatDay, formatShortDate, monthLabel, weekdayLabel } from '../utils/date';
import { formatLocalDate, parseLocalDate } from '../utils/date.js';

// Calendar view that merges availability with the user's bookings.
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

  const groupedDays = useMemo(() => (Array.isArray(days) ? days : []), [days]);

  const myBookingsByKey = useMemo(() => {
    const map = new Map();
    (myBookings || []).forEach((item) => {
      map.set(bookingKey(item), item);
    });
    return map;
  }, [myBookings]);

  const itemsByDate = useMemo(() => {
    const map = {};
    groupedDays.forEach((day) => {
      map[day.date] = (day.items || []).map((item) => {
        const match = myBookingsByKey.get(bookingKey(item));
        if (!match) {
          return {
            ...item,
            waitingListPosition: 0,
          };
        }
        return {
          ...item,
          bookingId: match.bookingId,
          idLesson: match.idLesson || item.idLesson,
          type: match.type ?? item.type,
          idDurata: match.idDurata ?? item.idDurata,
          isUserPresent: match.isUserPresent,
          waitingListPosition: Number(match.waitingListPosition ?? 0),
        };
      });
    });
    return map;
  }, [groupedDays, myBookingsByKey]);

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
    const end = parseLocalDate(meta.endDate);

    end.setMonth(end.getMonth() + 1);
    end.setDate(0);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

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

  const selectedItems = selectedDate ? visibleItemsByDate[selectedDate] || [] : [];

  return (
    <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Bookable calendar</h2>
          <p className="text-sm text-slate-600">This month and next month at a glance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Refresh calendar
          </button>
        </div>
      </div>

      {!hasDays && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          No upcoming lessons found.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-6">
          {monthGroups.map((group) => {
            const dates = group.dates;
            const firstDay = new Date(`${dates[0]}T00:00:00`);
            const jsDay = firstDay.getDay();
            const mondayIndex = (jsDay + 6) % 7;
            const blanks = Array.from({ length: mondayIndex }, () => null);
            const calendarCells = [...blanks, ...dates];

            return (
              <div key={group.label} className="flex gap-4">
                <div className="flex w-10 items-center justify-center">
                  <div className="rotate-180 text-xs font-semibold uppercase tracking-widest text-slate-400 [writing-mode:vertical-rl]">
                    {group.label}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-500">
                    {WEEKDAY_LABELS.map((label) => (
                      <div key={`${group.label}-${label}`}>{label}</div>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-7 gap-2">
                    {calendarCells.map((date, index) => {
                      if (!date) {
                        return (
                          <div
                            key={`empty-${group.label}-${index}`}
                            className="h-14 rounded-md border border-transparent"
                          />
                        );
                      }
                      const items = visibleItemsByDate[date] || [];
                      const booked = items.some((item) => item.isUserPresent);
                      const waitingListItem = items.find((item) => Number(item.waitingListPosition) > 0);
                      const hasWaitingList = Boolean(waitingListItem);
                      const hasItems = items.length > 0;
                      const isSelected = selectedDate === date;
                      return (
                        <button
                          key={date}
                          type="button"
                          onClick={() => onSelectDate(date)}
                          className={`h-14 rounded-md border px-2 py-2 text-xs font-medium transition ${
                            isSelected
                              ? 'border-brand bg-brand text-white'
                              : hasItems
                                ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                                : 'border-slate-200 bg-slate-100 text-slate-400'
                          }`}
                        >
                          <div className="flex h-full flex-col items-center justify-center gap-1 text-center leading-none">
                            <div className="text-[12px] font-semibold">{formatDay(date)}</div>
                            <div className="flex flex-col items-center gap-1 text-[9px] font-semibold">
                              {booked && <span className="text-success">Booked</span>}
                              {hasWaitingList ? (
                                <span className="text-warning">
                                  {waitingListItem ? `WL #${waitingListItem.waitingListPosition}` : 'WL'}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50/60 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-700">
            {selectedDate ? `${formatShortDate(selectedDate)} - ${weekdayLabel(selectedDate)}` : 'Select a date'}
          </div>
          <div className="space-y-2">
            {selectedItems.map((item) => (
              <div
                key={`${item.idLesson}-${item.startTime}`}
                className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="font-semibold text-slate-800">{item.service}</div>
                  <div className="text-xs text-slate-500">
                    {item.category} - {item.startTime}-{item.endTime}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    Seats: {item.availablePlaces}
                  </span>
                  {item.isUserPresent ? (
                    <span className="rounded-md bg-success-soft px-2 py-1 text-xs font-semibold text-success-deep">
                      Booked
                    </span>
                  ) : null}
                  {item.waitingListPosition > 0 ? (
                    <span className="rounded-md bg-warning-soft px-2 py-1 text-xs font-semibold text-warning-deep">
                      {`WL #${item.waitingListPosition}`}
                    </span>
                  ) : null}
                  {item.bookingId ? (
                    <button
                      type="button"
                      onClick={() => onCancel(item)}
                      className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      Cancel
                    </button>
                  ) : null}
                  {!item.isUserPresent && item.waitingListPosition <= 0 && (
                    <button
                      type="button"
                      onClick={() => onBook(item)}
                      className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-brand-dark"
                    >
                      {item.availablePlaces > 0 ? 'Book' : 'Join waitlist'}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {selectedDate && selectedItems.length === 0 && (
              <div className="text-sm text-slate-500">No courses available.</div>
            )}
            {!selectedDate && (
              <div className="text-sm text-slate-500">Pick a day to see the lessons.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
