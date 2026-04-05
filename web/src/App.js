import React, { useCallback, useEffect, useState } from 'react';
import CalendarView from './components/CalendarView';
import Dashboard from './components/Dashboard';
import Header from './components/Header';
import LoadingOverlay from './components/LoadingOverlay';
import LoginForm from './components/LoginForm';
import NoticeToast from './components/NoticeToast';
import { supabase } from './services/supabaseClient';
import { fetchCalendar, fetchCourses, fetchMyBookings, bookLesson, cancelLesson } from './services/gymFunctions';
import { getSession, signInOrSignUp } from './services/auth';

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
  const [activeTab, setActiveTab] = useState('calendar');

  const isBusy = pendingCount > 0;

  // Tracks async work so we can show a consistent loading overlay.
  const runWithPending = useCallback(async (fn) => {
    setPendingCount((count) => count + 1);
    try {
      return await fn();
    } finally {
      setPendingCount((count) => Math.max(0, count - 1));
    }
  }, []);

  const loadUser = useCallback(async (id) => {
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
      } catch (_err) {
        setError('Failed to load user data');
      }
    });
  }, [runWithPending]);

  const loadCourses = useCallback(async () => {
    return runWithPending(async () => {
      try {
        const byDay = await fetchCourses();
        setCoursesByDay(byDay || {});
      } catch (_err) {
        setCoursesByDay({});
        setNotice({ type: 'warning', message: 'Unable to load courses for this week.' });
      }
    });
  }, [runWithPending]);

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
        await loadCourses();
      });
    } catch (err) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const loadCalendar = useCallback(async () => {
    return runWithPending(async () => {
      try {
        const data = await fetchCalendar();
        const days = Array.isArray(data?.days) ? data.days : [];
        setCalendarDays(days);
        const startDate = data?.start_date || null;
        const endDate = data?.end_date || null;
        setCalendarMeta({ startDate, endDate });
        if (startDate && (!selectedDate || selectedDate < startDate || selectedDate > endDate)) {
          setSelectedDate(startDate);
        }
      } catch (_err) {
        setCalendarDays([]);
        setCalendarMeta({ startDate: null, endDate: null });
        setNotice({ type: 'warning', message: 'Unable to load the calendar.' });
      }
    });
  }, [runWithPending, selectedDate]);

  const loadMyBookings = useCallback(async () => {
    return runWithPending(async () => {
      try {
        const items = await fetchMyBookings();
        setMyBookings(items);
      } catch (_err) {
        setMyBookings([]);
        setNotice({ type: 'warning', message: 'Unable to load your bookings.' });
      }
    });
  }, [runWithPending]);

  const handleBooking = async (item) => {
    return runWithPending(async () => {
      try {
        await bookLesson(item);
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
        await cancelLesson(item);
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
        await loadCourses();
        setNotice({ type: 'success', message: 'Preferences updated.' });
      });
    } catch (_err) {
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
  }, [loadUser]);

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
  }, [activeTab, user?.id, loadCalendar, loadMyBookings]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
      {isBusy && <LoadingOverlay />}
      <NoticeToast notice={notice} />
      <div className="mx-auto max-w-5xl px-4 py-6 md:py-10">
        <Header
          user={user}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onRefreshCourses={loadCourses}
          onLogout={handleLogout}
        />

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

export default App;
