import React, { useCallback, useEffect, useRef, useState } from 'react';
import CalendarView from './components/CalendarView';
import ChangePasswordModal from './components/ChangePasswordModal';
import Dashboard from './components/Dashboard';
import Header from './components/Header';
import LoadingOverlay from './components/LoadingOverlay';
import LoginForm from './components/LoginForm';
import NoticeToast from './components/NoticeToast';
import Sidebar from './components/Sidebar';
import { supabase } from './services/supabaseClient';
import {
  bookLesson,
  cancelLesson,
  changeGymPassword,
  fetchCalendar,
  fetchCourses,
  fetchMyBookings,
} from './services/gymFunctions';
import { getSession, signInOrSignUp } from './services/auth';
import { getTodayIsoLocal } from './utils/date';

function App() {
  const [sessionUserId, setSessionUserId] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState('');
  const [coursesByDay, setCoursesByDay] = useState({});
  const [calendarDays, setCalendarDays] = useState([]);
  const [calendarMeta, setCalendarMeta] = useState({ startDate: null, endDate: null });
  const [selectedDate, setSelectedDate] = useState(getTodayIsoLocal());
  const [myBookings, setMyBookings] = useState([]);
  const [notice, setNotice] = useState(null);
  const [activeTab, setActiveTab] = useState('calendar');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const selectedByUserRef = useRef(false);

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
          .select('weekday, course, lesson_start_time')
          .eq('user_id', id);
        if (prefError) {
          throw prefError;
        }
        const byDay = {};
        (prefRows || []).forEach((row) => {
          if (!row?.lesson_start_time) return;
          byDay[row.weekday] = byDay[row.weekday] || [];
          byDay[row.weekday].push({
            course: row.course,
            lesson_start_time: row.lesson_start_time,
          });
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
        selectedByUserRef.current = false;
        setSelectedDate(getTodayIsoLocal());
        setActiveTab('calendar');
      });
    } catch (err) {
      const message = String(err?.message || '');
      if (message.includes('Login not successful') || message.toLowerCase().includes('bad login')) {
        setError('Wrong credentials');
      } else {
        setError(err?.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async ({ oldPassword, newPassword, confirmPassword }) => {
    if (newPassword !== confirmPassword) {
      setNotice({ type: 'error', message: 'New passwords do not match.' });
      return;
    }

    setLoading(true);
    setPasswordSuccess('');
    try {
      await runWithPending(async () => {
        await changeGymPassword(oldPassword, newPassword);
        setPasswordSuccess('Password updated successfully.');
        setNotice({ type: 'success', message: 'Password updated.' });
      });
    } catch (err) {
      const message = String(err?.message || '');
      if (message.toLowerCase().includes('password') || message.toLowerCase().includes('login')) {
        setNotice({ type: 'error', message: 'Wrong credentials' });
      } else {
        setNotice({ type: 'error', message: err?.message || 'Unable to change password.' });
      }
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

        const today = getTodayIsoLocal();
        const isSelectedValid = selectedDate && startDate && endDate
          ? selectedDate >= startDate && selectedDate <= endDate
          : Boolean(selectedDate);

        if (!selectedByUserRef.current) {
          if (today && startDate && endDate && today >= startDate && today <= endDate) {
            setSelectedDate(today);
          } else if (startDate) {
            setSelectedDate(startDate);
          }
          return;
        }

        if (!isSelectedValid && startDate) {
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
        Object.entries(cleanedByDay).forEach(([weekday, slots]) => {
          (slots || []).forEach((slot) => {
            const course = String(slot?.course || '').trim().toLowerCase();
            const lessonStartTime = String(slot?.lesson_start_time || '').trim();
            if (course && lessonStartTime) {
              rows.push({
                user_id: sessionUserId,
                weekday,
                course,
                lesson_start_time: lessonStartTime,
              });
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
    selectedByUserRef.current = false;
    setSelectedDate(getTodayIsoLocal());
  };

  const handleSelectDate = (date) => {
    selectedByUserRef.current = true;
    setSelectedDate(date);
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
      } else {
        selectedByUserRef.current = false;
        setSelectedDate(getTodayIsoLocal());
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
          selectedByUserRef.current = false;
          setSelectedDate(getTodayIsoLocal());
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
    <div className="min-h-screen bg-gradient-to-br from-opal-mist via-opal-pearl to-opal-sky text-slate-900">
      {isBusy && <LoadingOverlay />}
      <NoticeToast notice={notice} />
      <div className="flex">
        {user && (
          <Sidebar
            user={user}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            isOpen={isMenuOpen}
            onClose={() => setIsMenuOpen(false)}
          />
        )}
        <div className="flex-1 px-4 py-6 md:px-8">
          <Header
            user={user}
            onToggleMenu={() => setIsMenuOpen((open) => !open)}
            onRefreshCourses={loadCourses}
            onLogout={handleLogout}
          />

          {error && (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {!user ? (
            <LoginForm
              onLogin={handleLogin}
              onChangePassword={() => {
                setPasswordSuccess('');
                setIsChangePasswordOpen(true);
              }}
              loading={loading}
            />
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
              onSelectDate={handleSelectDate}
              onRefresh={refreshCalendar}
              onBook={handleBooking}
              onCancel={handleCancel}
            />
          )}
        </div>
      </div>

      <ChangePasswordModal
        open={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        onSubmit={handleChangePassword}
        loading={loading}
        successMessage={passwordSuccess}
      />
    </div>
  );
}

export default App;


