import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MONTH_LABELS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

const NOTICE_COLORS = {
  success: 'bg-emerald-600',
  info: 'bg-sky-600',
  warning: 'bg-amber-600',
  error: 'bg-rose-600',
};

const TABS = [
  { id: 'preferences', label: 'Preferences' },
  { id: 'calendar', label: 'Calendar' },
];

function App() {
  const [sessionUserId, setSessionUserId] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState('');
  const [coursesByDay, setCoursesByDay] = useState({});
  const [calendarDays, setCalendarDays] = useState([]);
  const [calendarMeta, setCalendarMeta] = useState({ startDate: null, endDate: null });
  const [selectedDate, setSelectedDate] = useState(null);
  const [myBookings, setMyBookings] = useState([]);
  const [notice, setNotice] = useState(null);
  const [activeTab, setActiveTab] = useState('preferences');

  const isBusy = pendingCount > 0;

  const runWithPending = async (fn) => {
    setPendingCount((count) => count + 1);
    try {
      return await fn();
    } finally {
      setPendingCount((count) => Math.max(0, count - 1));
    }
  };

  useEffect(() => {
    let isMounted = true;
    const initSession = async () => {
      const session = await getSession();
      if (!isMounted) return;
      const userId = session?.user?.id || null;
      setSessionUserId(userId);
      if (userId) {
        loadUser(userId).catch(() => {});
      }
    };
    initSession().catch(() => {
      if (isMounted) {
        setError('Unable to start session.');
      }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        const userId = session?.user?.id || null;
        setSessionUserId(userId);
        if (userId) {
          loadUser(userId).catch(() => {});
        } else {
          setUser(null);
          setCoursesByDay({});
          setCalendarDays([]);
          setCalendarMeta({ startDate: null, endDate: null });
        }
      }
    });
    return () => {
      isMounted = false;
      subscription?.subscription?.unsubscribe?.();
      subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!user?.id) return;
    if (activeTab === 'calendar') {
      loadCalendar().catch(() => {});
      loadMyBookings().catch(() => {});
    }
  }, [activeTab, user?.id]);

  const handleLogin = async (username, password) => {
    setLoading(true);
    setError('');
    try {
      await runWithPending(async () => {
        const session = await signInOrSignUp(username, password);
        if (!session?.access_token) throw new Error('Missing auth session');
        const { data, error: invokeError } = await supabase.functions.invoke('gym-login', {
          body: { username, password },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (invokeError) {
          throw invokeError;
        }
        const currentUserId = data?.user_id || session.user.id;
        await loadUser(currentUserId);
        await loadCourses(currentUserId);
      });
    } catch (err) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const loadUser = async (id) => {
    return runWithPending(async () => {
      try {
        const { data: userRow, error: userError } = await supabase
          .from('users')
          .select('id, username')
          .eq('id', id)
          .maybeSingle();
        if (userError) {
          throw userError;
        }
        if (!userRow) {
          setUser(null);
          return;
        }
        const { data: prefRows, error: prefError } = await supabase
          .from('preferences')
          .select('weekday, course')
          .eq('user_id', id);
        if (prefError) {
          throw prefError;
        }
        const byDay = {};
        (prefRows || []).forEach((row) => {
          byDay[row.weekday] = byDay[row.weekday] || [];
          byDay[row.weekday].push(row.course);
        });
        setUser({
          id,
          credentials: { username: userRow?.username || '' },
          preferences: { by_day: byDay },
        });
      } catch (err) {
        setError('Failed to load user data');
      }
    });
  };

  const loadCourses = async (id) => {
    return runWithPending(async () => {
      try {
        const session = await getSession();
        if (!session?.access_token) throw new Error('Missing auth session');
        const { data, error: invokeError } = await supabase.functions.invoke('gym-courses', {
          body: { user_id: id },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (invokeError) {
          throw invokeError;
        }
        setCoursesByDay(data?.by_day || {});
      } catch (err) {
        setCoursesByDay({});
        setNotice({ type: 'warning', message: 'Unable to load courses for this week.' });
      }
    });
  };

  const loadCalendar = async () => {
    return runWithPending(async () => {
      try {
        const session = await getSession();
        if (!session?.access_token) throw new Error('Missing auth session');
        const { data, error: invokeError } = await supabase.functions.invoke('gym-calendar', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (invokeError) {
          throw invokeError;
        }
        const days = Array.isArray(data?.days) ? data.days : [];
        setCalendarDays(days);
        const startDate = data?.start_date || null;
        const endDate = data?.end_date || null;
        setCalendarMeta({ startDate, endDate });
        if (startDate && (!selectedDate || selectedDate < startDate || selectedDate > endDate)) {
          setSelectedDate(startDate);
        }
      } catch (err) {
        setCalendarDays([]);
        setCalendarMeta({ startDate: null, endDate: null });
        setNotice({ type: 'warning', message: 'Unable to load the calendar.' });
      }
    });
  };

  const loadMyBookings = async () => {
    return runWithPending(async () => {
      try {
        const session = await getSession();
        if (!session?.access_token) throw new Error('Missing auth session');
        const { data, error: invokeError } = await supabase.functions.invoke('gym-mybooks', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (invokeError) {
          throw invokeError;
        }
        setMyBookings(Array.isArray(data?.items) ? data.items : []);
      } catch (err) {
        setMyBookings([]);
        setNotice({ type: 'warning', message: 'Unable to load your bookings.' });
      }
    });
  };

  const handleBooking = async (item) => {
    return runWithPending(async () => {
      try {
        const session = await getSession();
        if (!session?.access_token) throw new Error('Missing auth session');
        const { error: invokeError } = await supabase.functions.invoke('gym-book', {
          body: {
            idService: item.idService,
            idLesson: item.idLesson,
            startTime: item.startTime,
            endTime: item.endTime,
            type: 0,
            idDurata: 0,
            bookNr: 0,
            availablePlaces: item.availablePlaces,
            isUserPresent: item.isUserPresent,
            waitingListPosition: item.waitingListPosition,
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (invokeError) {
          throw invokeError;
        }
        setNotice({ type: 'success', message: 'Booking request sent.' });
        await loadCalendar();
        await loadMyBookings();
      } catch (err) {
        setNotice({ type: 'error', message: err?.message || 'Booking failed.' });
      }
    });
  };

  const handleCancel = async (item) => {
    return runWithPending(async () => {
      try {
        const session = await getSession();
        if (!session?.access_token) throw new Error('Missing auth session');
        const { error: invokeError } = await supabase.functions.invoke('gym-cancel', {
          body: {
            bookingId: item.bookingId,
            idLesson: item.idLesson,
            type: item.type ?? 0,
            idDurata: item.idDurata ?? 0,
            startTime: item.startTime,
            endTime: item.endTime,
            isUserPresent: item.isUserPresent,
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (invokeError) {
          throw invokeError;
        }
        setNotice({ type: 'success', message: 'Booking removed.' });
        await loadCalendar();
        await loadMyBookings();
      } catch (err) {
        setNotice({ type: 'error', message: err?.message || 'Unable to cancel booking.' });
      }
    });
  };

  const refreshCalendar = async () => {
    await loadCalendar();
    await loadMyBookings();
  };

  const updatePreferences = async (preferences) => {
    setLoading(true);
    setError('');
    try {
      await runWithPending(async () => {
        if (!sessionUserId) {
          throw new Error('Missing user session');
        }
        const cleanedByDay = preferences?.by_day || {};
        const rows = [];
        Object.entries(cleanedByDay).forEach(([weekday, courses]) => {
          (courses || []).forEach((course) => {
            const normalized = String(course || '').trim().toLowerCase();
            if (normalized) {
              rows.push({ user_id: sessionUserId, weekday, course: normalized });
            }
          });
        });
        const { error: deleteError } = await supabase
          .from('preferences')
          .delete()
          .eq('user_id', sessionUserId);
        if (deleteError) {
          throw deleteError;
        }
        if (rows.length) {
          const { error: insertError } = await supabase.from('preferences').insert(rows);
          if (insertError) {
            throw insertError;
          }
        }
        await loadUser(sessionUserId);
        await loadCourses(sessionUserId);
        setNotice({ type: 'success', message: 'Preferences updated.' });
      });
    } catch (err) {
      setError('Failed to update preferences');
      setNotice({ type: 'error', message: 'Failed to update preferences.' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    supabase.auth.signOut().catch(() => {});
    setSessionUserId(null);
    setUser(null);
    setCoursesByDay({});
    setCalendarDays([]);
    setCalendarMeta({ startDate: null, endDate: null });
    setMyBookings([]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
      {isBusy && <LoadingOverlay />}
      {notice && (
        <div
          className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 text-white px-4 py-2 rounded-full shadow-lg ${NOTICE_COLORS[notice.type]}`}
        >
          {notice.message}
        </div>
      )}
      <div className="mx-auto max-w-5xl px-4 py-6 md:py-10">
        <header className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Gym Bot</h1>
              <p className="text-sm text-slate-600">
                Weekly course preferences with automatic booking.
              </p>
            </div>
            {user && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadCourses(sessionUserId)}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  type="button"
                >
                  Refresh courses
                </button>
                <button
                  onClick={handleLogout}
                  className="rounded-full bg-slate-900 px-3 py-1 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
                  type="button"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
          {user?.credentials?.username && (
            <div className="text-sm text-slate-600">
              Signed in as <span className="font-medium text-slate-800">{user.credentials.username}</span>
            </div>
          )}
          {user && (
            <div className="flex flex-wrap gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-full px-4 py-1 text-sm font-medium transition ${
                    activeTab === tab.id
                      ? 'bg-slate-900 text-white shadow'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {!user ? (
          <LoginForm onLogin={handleLogin} loading={loading} />
        ) : activeTab === 'preferences' ? (
          <Dashboard
            user={user}
            coursesByDay={coursesByDay}
            onUpdatePreferences={updatePreferences}
            loading={loading}
          />
        ) : (
          <CalendarView
            days={calendarDays}
            meta={calendarMeta}
            myBookings={myBookings}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onRefresh={refreshCalendar}
            onBook={handleBooking}
            onCancel={handleCancel}
          />
        )}
      </div>
    </div>
  );
}

function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-lg">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
        <div className="text-sm font-medium text-slate-700">Loading...</div>
      </div>
    </div>
  );
}

function LoginForm({ onLogin, loading }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(username, password);
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold">Sign in</h2>
      <p className="mb-4 text-sm text-slate-600">Use your gym portal credentials.</p>
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700" htmlFor="username">
            Username
          </label>
          <input
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700" htmlFor="password">
            Password
          </label>
          <input
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Logging in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

function Dashboard({ user, coursesByDay, onUpdatePreferences, loading }) {
  const [byDay, setByDay] = useState({});
  const [courseFilter, setCourseFilter] = useState('');

  useEffect(() => {
    const normalized = {};
    WEEKDAYS.forEach((day) => {
      const values = user?.preferences?.by_day?.[day] || [];
      normalized[day] = Array.isArray(values) ? values : [];
    });
    setByDay(normalized);
  }, [user]);

  const toggleCourseForDay = (day, course) => {
    setByDay((prev) => {
      const current = new Set(prev[day] || []);
      if (current.has(course)) {
        current.delete(course);
      } else {
        current.add(course);
      }
      return { ...prev, [day]: Array.from(current) };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onUpdatePreferences({ by_day: byDay });
  };

  const hasCourses = Object.keys(coursesByDay || {}).length > 0;
  const filterValue = courseFilter.trim().toLowerCase();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">Course preferences</h2>
        <p className="text-sm text-slate-600">
          Choose the classes you want for each day. Use search to narrow down the list.
        </p>
      </div>

      <div className="mb-5">
        <label className="block text-sm font-medium text-slate-700" htmlFor="courseFilter">
          Search courses
        </label>
        <input
          id="courseFilter"
          type="text"
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
          placeholder="Type to filter"
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
        />
      </div>

      {!hasCourses && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          No courses found for this week. Try refreshing.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {WEEKDAYS.map((day) => {
          const dayCourses = (coursesByDay[day] || []).filter((course) => {
            if (!filterValue) return true;
            return course.includes(filterValue);
          });

          return (
            <div key={day} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-3 text-sm font-semibold text-slate-700">
                {day.charAt(0).toUpperCase() + day.slice(1)}
              </div>
              <div className="flex flex-wrap gap-2">
                {dayCourses.map((course) => {
                  const checked = (byDay[day] || []).includes(course);
                  return (
                    <label
                      key={`${day}-${course}`}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition ${
                        checked
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => toggleCourseForDay(day, course)}
                      />
                      {course.charAt(0).toUpperCase() + course.slice(1)}
                    </label>
                  );
                })}
                {dayCourses.length === 0 && (
                  <span className="text-sm text-slate-500">No courses</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
          type="submit"
          disabled={loading}
          onClick={handleSubmit}
        >
          {loading ? 'Updating...' : 'Update Preferences'}
        </button>
      </div>
    </div>
  );
}

function CalendarView({ days, meta, myBookings, selectedDate, onSelectDate, onRefresh, onBook, onCancel }) {
  const hasDays = Array.isArray(days) && days.length > 0;
  const [calendarFilter, setCalendarFilter] = useState('all');
  const showWaitlistPosition = calendarFilter === 'mine';
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
        if (!match) return item;
        return {
          ...item,
          bookingId: match.bookingId,
          idLesson: match.idLesson || item.idLesson,
          type: match.type ?? item.type,
          idDurata: match.idDurata ?? item.idDurata,
          isUserPresent: match.isUserPresent,
          waitingListPosition: match.waitingListPosition ?? item.waitingListPosition,
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
        (item) => item.isUserPresent || Number(item.waitingListPosition) > 0
      );
    });
    return map;
  }, [itemsByDate, calendarFilter]);

  const dateList = useMemo(() => {
    if (!meta?.startDate || !meta?.endDate) return [];
    const start = new Date(`${meta.startDate}T00:00:00`);
    const end = new Date(`${meta.endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
    const list = [];
    const current = new Date(start);
    while (current <= end) {
      list.push(current.toISOString().slice(0, 10));
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Bookable calendar</h2>
          <p className="text-sm text-slate-600">This month and next month at a glance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <button
              type="button"
              onClick={() => setCalendarFilter('all')}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                calendarFilter === 'all' ? 'bg-white text-slate-700 shadow' : 'text-slate-500'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setCalendarFilter('mine')}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                calendarFilter === 'mine' ? 'bg-white text-slate-700 shadow' : 'text-slate-500'
              }`}
            >
              My bookings
            </button>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Refresh calendar
          </button>
        </div>
      </div>

      {!hasDays && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
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
                        return <div key={`empty-${group.label}-${index}`} className="h-14 rounded-lg border border-transparent" />;
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
                          className={`h-14 rounded-lg border px-2 py-2 text-xs font-medium transition ${
                            isSelected
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : hasItems
                                ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                                : 'border-slate-200 bg-slate-100 text-slate-400'
                          }`}
                        >
                          <div className="flex h-full flex-col items-center justify-center gap-1 text-center leading-none">
                            <div className="text-[12px] font-semibold">{formatDay(date)}</div>
                            <div className="flex flex-col items-center gap-1 text-[9px] font-semibold">
                              {booked && <span className="text-emerald-200">Booked</span>}
                              {hasWaitingList ? (
                                <span className="text-amber-200">
                                  {showWaitlistPosition && waitingListItem
                                    ? `WL #${waitingListItem.waitingListPosition}`
                                    : 'WL'}
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

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-700">
            {selectedDate ? `${formatShortDate(selectedDate)} � ${weekdayLabel(selectedDate)}` : 'Select a date'}
          </div>
          <div className="space-y-2">
            {selectedItems.map((item) => (
              <div
                key={`${item.idLesson}-${item.startTime}`}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="font-semibold text-slate-800">{item.service}</div>
                  <div className="text-xs text-slate-500">
                    {item.category} � {item.startTime}�{item.endTime}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    Seats: {item.availablePlaces}
                  </span>
                  {item.isUserPresent ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                      Booked
                    </span>
                  ) : null}
                  {item.waitingListPosition > 0 ? (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                      {showWaitlistPosition ? `WL #${item.waitingListPosition}` : 'WL'}
                    </span>
                  ) : null}
                  {item.bookingId ? (
                    <button
                      type="button"
                      onClick={() => onCancel(item)}
                      className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      Cancel
                    </button>
                  ) : null}
                  {!item.isUserPresent && item.waitingListPosition <= 0 && (
                    <button
                      type="button"
                      onClick={() => onBook(item)}
                      className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
                    >
                      {item.availablePlaces > 0 ? 'Book' : 'Join waitlist'}
                    </button>
                  )}
                </div>
              </div>
            ))
            }
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

export default App;

function formatShortDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}/${year.slice(2)}`;
}

function formatDay(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return String(Number(parts[2]));
}

function monthLabel(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const month = MONTH_LABELS[Number(parts[1]) - 1] || parts[1];
  return `${month} ${parts[0]}`;
}

function weekdayLabel(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const jsDay = date.getDay();
  const mondayIndex = (jsDay + 6) % 7;
  return WEEKDAY_LABELS[mondayIndex] || '';
}

function bookingKey(item) {
  const service = String(item?.service || '').toLowerCase();
  const date = String(item?.date || '');
  const startRaw = String(item?.startTime || '');
  const endRaw = String(item?.endTime || '');
  const start = startRaw.includes('T') ? startRaw.slice(11, 16) : startRaw;
  const end = endRaw.includes('T') ? endRaw.slice(11, 16) : endRaw;
  return `${date}|${service}|${start}|${end}`;
}

async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

function usernameToEmail(username) {
  const cleaned = String(username || '').trim().toLowerCase();
  return `${cleaned}@gymbot.example`;
}

async function signInOrSignUp(username, password) {
  const email = usernameToEmail(username);
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (!signInError && signInData?.session) {
    return signInData.session;
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });
  if (signUpError && signUpError.message !== 'User already registered') {
    throw signUpError;
  }
  if (signUpData?.session) {
    return signUpData.session;
  }

  const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (retryError) {
    throw retryError;
  }
  return retryData.session;
}
