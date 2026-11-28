import React, { useCallback, useEffect, useRef, useState } from 'react';
import CalendarView from './components/CalendarView';
import ChangePasswordModal from './components/ChangePasswordModal';
import Dashboard from './components/Dashboard';
import Header from './components/Header';
import LoadingOverlay from './components/LoadingOverlay';
import LoginForm from './components/LoginForm';
import NoticeToast from './components/NoticeToast';
import TelegramModal from './components/TelegramModal';
import { supabase } from './services/supabaseClient';
import {
  bookLesson,
  cancelLesson,
  changeGymPassword,
  createTelegramLink,
  disconnectTelegram,
  fetchCalendar,
  fetchCourses,
  fetchMyBookings,
} from './services/gymFunctions';
import { getSession, reauthenticateUser, signInOrSignUp } from './services/auth';
import { getTodayIsoLocal } from './utils/date';
import { extractFunctionError } from './utils/functionError';
import { applyTheme, getInitialTheme } from './utils/theme';

function App() {
  const [theme, setTheme] = useState(getInitialTheme);
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
  const [bookingRuns, setBookingRuns] = useState([]);
  const [notice, setNotice] = useState(null);
  const [activeTab, setActiveTab] = useState('calendar');
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [telegramConnection, setTelegramConnection] = useState(null);
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [telegramLinkUrl, setTelegramLinkUrl] = useState('');

  const selectedByUserRef = useRef(false);
  const loginInProgressRef = useRef(false);
  const coursesLoadedRef = useRef(false);

  const isBusy = pendingCount > 0;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Tracks async work so we can show a subtle non-jarring syncing indicator.
  const runWithPending = useCallback(async (fn) => {
    setPendingCount((count) => count + 1);
    try {
      return await fn();
    } finally {
      setPendingCount((count) => Math.max(0, count - 1));
    }
  }, []);

  const loadBookingRuns = useCallback(async (id) => {
    if (!id) {
      setBookingRuns([]);
      return;
    }
    try {
      const { data, error: lockError } = await supabase
        .from('booking_daily_lock')
        .select('run_date, status, locked_at, error')
        .eq('user_id', id)
        .order('run_date', { ascending: false })
        .limit(5);
      if (lockError) {
        setBookingRuns([]);
        return;
      }
      setBookingRuns(Array.isArray(data) ? data : []);
    } catch (_err) {
      setBookingRuns([]);
    }
  }, []);

  const loadTelegramConnection = useCallback(async (id) => {
    if (!id) {
      setTelegramConnection(null);
      return;
    }
    try {
      const { data, error: tgError } = await supabase
        .from('telegram_connections')
        .select('telegram_username, enabled, connected_at')
        .eq('user_id', id)
        .maybeSingle();
      if (tgError || !data) {
        setTelegramConnection(null);
        return;
      }
      setTelegramConnection({
        telegramUsername: data.telegram_username || '',
        enabled: data.enabled !== false,
        connectedAt: data.connected_at || null,
      });
    } catch (_err) {
      setTelegramConnection(null);
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
          setBookingRuns([]);
          setTelegramConnection(null);
          return;
        }
        const [{ data: prefRows, error: prefError }] = await Promise.all([
          supabase
            .from('preferences')
            .select('weekday, course, lesson_start_time')
            .eq('user_id', id),
          loadBookingRuns(id),
          loadTelegramConnection(id),
        ]);
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
  }, [runWithPending, loadBookingRuns, loadTelegramConnection]);

  const loadCourses = useCallback(async () => {
    return runWithPending(async () => {
      try {
        const byDay = await fetchCourses();
        setCoursesByDay(byDay || {});
        coursesLoadedRef.current = true;
      } catch (_err) {
        setCoursesByDay({});
        setNotice({ type: 'warning', message: 'Unable to load courses for this week.' });
      }
    });
  }, [runWithPending]);

  const handleLogin = async (username, password) => {
    setLoading(true);
    setError('');
    loginInProgressRef.current = true;
    try {
      await runWithPending(async () => {
        const session = await signInOrSignUp(username, password);
        if (!session?.access_token) throw new Error('Missing auth session');

        const { data, error: invokeError } = await supabase.functions.invoke('gym-login', {
          body: { username, password },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (invokeError) {
          const detail = await extractFunctionError(invokeError, 'Login failed');
          throw new Error(detail);
        }
        if (data?.error) {
          throw new Error(String(data.error));
        }

        const currentUserId = data?.user_id || session.user.id;
        setSessionUserId(currentUserId);
        await Promise.all([loadUser(currentUserId), loadCourses()]);
        selectedByUserRef.current = false;
        setSelectedDate(getTodayIsoLocal());
        setActiveTab('calendar');
      });
    } catch (err) {
      const message = String(err?.message || '');
      const normalized = message.toLowerCase();
      if (
        normalized.includes('login not successful')
        || normalized.includes('bad login')
        || normalized.includes('invalid login credentials')
      ) {
        setError('Wrong credentials');
      } else {
        setError(message || 'Login failed');
      }
    } finally {
      loginInProgressRef.current = false;
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
    loginInProgressRef.current = true;
    try {
      await runWithPending(async () => {
        await changeGymPassword(oldPassword, newPassword);
        // Updating the password in GoTrue revokes the old session; re-authenticate seamlessly.
        if (user?.credentials?.username) {
          await reauthenticateUser(user.credentials.username, newPassword);
        }
        setPasswordSuccess('Password updated successfully.');
        setNotice({ type: 'success', message: 'Password updated.' });
      });
    } catch (err) {
      const message = String(err?.message || '');
      if (message.toLowerCase().includes('password') || message.toLowerCase().includes('login')) {
        setNotice({ type: 'error', message: 'Wrong credentials' });
      } else {
        setNotice({ type: 'error', message: message || 'Unable to change password.' });
      }
    } finally {
      loginInProgressRef.current = false;
      setLoading(false);
    }
  };

  // Must not depend on `selectedDate` so clicking calendar days stays client-side.
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
        setSelectedDate((prevSelected) => {
          const isSelectedValid = prevSelected && startDate && endDate
            ? prevSelected >= startDate && prevSelected <= endDate
            : Boolean(prevSelected);

          if (!selectedByUserRef.current) {
            if (today && startDate && endDate && today >= startDate && today <= endDate) {
              return today;
            }
            if (startDate) {
              return startDate;
            }
            return prevSelected;
          }

          if (!isSelectedValid && startDate) {
            return startDate;
          }
          return prevSelected;
        });
      } catch (_err) {
        setCalendarDays([]);
        setCalendarMeta({ startDate: null, endDate: null });
        setNotice({ type: 'warning', message: 'Unable to load the calendar.' });
      }
    });
  }, [runWithPending]);

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
        await Promise.all([loadCalendar(), loadMyBookings()]);
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
        await Promise.all([loadCalendar(), loadMyBookings()]);
      } catch (err) {
        setNotice({ type: 'error', message: err?.message || 'Unable to cancel booking.' });
      }
    });
  };

  const refreshCalendar = async () => {
    await Promise.all([loadCalendar(), loadMyBookings()]);
  };

  // Atomic preference save: upsert new rows before deleting removed ones.
  const updatePreferences = async (preferences) => {
    setLoading(true);
    setError('');
    try {
      await runWithPending(async () => {
        const targetUserId = sessionUserId || user?.id;
        if (!targetUserId) {
          throw new Error('Missing user session');
        }
        const cleanedByDay = preferences?.by_day || {};
        const normalizeTime = (value) => {
          const text = String(value || '').trim();
          if (!text) return '';
          return text.length === 5 ? `${text}:00` : text;
        };

        const rowMap = new Map();
        Object.entries(cleanedByDay).forEach(([weekday, slots]) => {
          const normalizedDay = String(weekday || '').trim().toLowerCase();
          (slots || []).forEach((slot) => {
            const course = String(slot?.course || '').trim().toLowerCase();
            const lessonStartTime = normalizeTime(slot?.lesson_start_time);
            if (normalizedDay && course && lessonStartTime) {
              const key = `${normalizedDay}|${course}|${lessonStartTime}`;
              rowMap.set(key, {
                user_id: targetUserId,
                weekday: normalizedDay,
                course,
                lesson_start_time: lessonStartTime,
              });
            }
          });
        });

        const rows = Array.from(rowMap.values());

        const { data: existingRows, error: existingError } = await supabase
          .from('preferences')
          .select('weekday, course, lesson_start_time')
          .eq('user_id', targetUserId);
        if (existingError) {
          throw existingError;
        }

        if (rows.length) {
          const { error: upsertError } = await supabase
            .from('preferences')
            .upsert(rows, {
              onConflict: 'user_id,weekday,course,lesson_start_time',
              ignoreDuplicates: true,
            });
          if (upsertError) {
            throw upsertError;
          }

          const removedRows = (existingRows || []).filter((existing) => {
            const key = `${String(existing.weekday || '').trim().toLowerCase()}|${String(existing.course || '').trim().toLowerCase()}|${normalizeTime(existing.lesson_start_time)}`;
            return !rowMap.has(key);
          });

          if (removedRows.length) {
            const deleteResults = await Promise.all(
              removedRows.map((removed) =>
                supabase
                  .from('preferences')
                  .delete()
                  .match({
                    user_id: targetUserId,
                    weekday: removed.weekday,
                    course: removed.course,
                    lesson_start_time: removed.lesson_start_time,
                  }),
              ),
            );
            const failedDelete = deleteResults.find((result) => result.error);
            if (failedDelete?.error) {
              throw failedDelete.error;
            }
          }
        } else if ((existingRows || []).length > 0) {
          const { error: deleteError } = await supabase
            .from('preferences')
            .delete()
            .eq('user_id', targetUserId);
          if (deleteError) {
            throw deleteError;
          }
        }

        await Promise.all([loadUser(targetUserId), loadCourses()]);
        setNotice({ type: 'success', message: 'Preferences updated.' });
      });
    } catch (_err) {
      setError('Failed to update preferences');
      setNotice({ type: 'error', message: 'Failed to update preferences.' });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateTelegramLink = async () => {
    setLoading(true);
    try {
      await runWithPending(async () => {
        const data = await createTelegramLink();
        if (!data?.url) {
          throw new Error('Unable to generate Telegram link.');
        }
        setTelegramLinkUrl(String(data.url));
      });
    } catch (err) {
      setNotice({ type: 'error', message: err?.message || 'Unable to generate Telegram link.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectTelegram = async () => {
    setLoading(true);
    try {
      await runWithPending(async () => {
        await disconnectTelegram();
        setTelegramConnection(null);
        setTelegramLinkUrl('');
        setNotice({ type: 'info', message: 'Telegram alerts disconnected.' });
      });
    } catch (err) {
      setNotice({ type: 'error', message: err?.message || 'Unable to disconnect Telegram.' });
    } finally {
      setLoading(false);
    }
  };

  const resetClientState = useCallback(() => {
    setSessionUserId(null);
    setUser(null);
    setCoursesByDay({});
    setCalendarDays([]);
    setCalendarMeta({ startDate: null, endDate: null });
    setMyBookings([]);
    setBookingRuns([]);
    setTelegramConnection(null);
    setTelegramLinkUrl('');
    setIsTelegramModalOpen(false);
    coursesLoadedRef.current = false;
    selectedByUserRef.current = false;
    setSelectedDate(getTodayIsoLocal());
  }, []);

  const handleLogout = () => {
    supabase.auth.signOut().catch(() => {});
    resetClientState();
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
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      const userId = session?.user?.id || null;
      setSessionUserId(userId);

      if (!userId) {
        resetClientState();
        return;
      }

      if (
        event === 'INITIAL_SESSION'
        || event === 'TOKEN_REFRESHED'
        || loginInProgressRef.current
      ) {
        return;
      }

      loadUser(userId).catch(() => {});
    });
    return () => {
      isMounted = false;
      subscription?.subscription?.unsubscribe?.();
      subscription?.unsubscribe?.();
    };
  }, [loadUser, resetClientState]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!user?.id) return;
    if (activeTab === 'calendar') {
      loadCalendar().catch(() => {});
      loadMyBookings().catch(() => {});
    } else if (activeTab === 'preferences') {
      loadBookingRuns(user.id).catch(() => {});
      if (!coursesLoadedRef.current) {
        loadCourses().catch(() => {});
      }
    }
  }, [activeTab, user?.id, loadCalendar, loadMyBookings, loadBookingRuns, loadCourses]);

  // Automatically refresh Telegram link status when returning from the Telegram app.
  useEffect(() => {
    const targetUserId = sessionUserId || user?.id;
    if (!isTelegramModalOpen || !targetUserId || telegramConnection) {
      return undefined;
    }

    const handleRefresh = () => {
      if (document.visibilityState === 'visible') {
        loadTelegramConnection(targetUserId).catch(() => {});
      }
    };

    window.addEventListener('focus', handleRefresh);
    document.addEventListener('visibilitychange', handleRefresh);
    return () => {
      window.removeEventListener('focus', handleRefresh);
      document.removeEventListener('visibilitychange', handleRefresh);
    };
  }, [isTelegramModalOpen, sessionUserId, user?.id, telegramConnection, loadTelegramConnection]);

  return (
    <div className="min-h-screen bg-slate-50 pb-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {isBusy && <LoadingOverlay />}
      <NoticeToast notice={notice} />

      <Header
        user={user}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        telegramConnected={Boolean(telegramConnection && telegramConnection.enabled !== false)}
        onOpenTelegram={() => {
          setTelegramLinkUrl('');
          setIsTelegramModalOpen(true);
        }}
        onOpenChangePassword={() => {
          setPasswordSuccess('');
          setIsChangePasswordOpen(true);
        }}
        onLogout={handleLogout}
      />

      <main className="mx-auto max-w-5xl px-3 pt-3 sm:px-6 sm:pt-5">
        {error && (
          <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        )}

        {!user ? (
          <LoginForm onLogin={handleLogin} loading={loading} />
        ) : activeTab === 'preferences' ? (
          <Dashboard
            user={user}
            coursesByDay={coursesByDay}
            bookingRuns={bookingRuns}
            telegramConnection={telegramConnection}
            onOpenTelegram={() => {
              setTelegramLinkUrl('');
              setIsTelegramModalOpen(true);
            }}
            onRefreshStatus={() => loadBookingRuns(user.id)}
            onRefreshCourses={loadCourses}
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
      </main>

      <ChangePasswordModal
        open={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        onSubmit={handleChangePassword}
        loading={loading}
        successMessage={passwordSuccess}
      />

      <TelegramModal
        open={isTelegramModalOpen}
        onClose={() => setIsTelegramModalOpen(false)}
        connection={telegramConnection}
        deepLinkUrl={telegramLinkUrl}
        loading={loading}
        onGenerateLink={handleGenerateTelegramLink}
        onCheckStatus={() => loadTelegramConnection(sessionUserId || user?.id)}
        onDisconnect={handleDisconnectTelegram}
      />
    </div>
  );
}

export default App;
