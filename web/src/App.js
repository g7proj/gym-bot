import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const NOTICE_COLORS = {
  success: 'bg-emerald-600',
  info: 'bg-sky-600',
  warning: 'bg-amber-600',
  error: 'bg-rose-600',
};

function App() {
  const [sessionUserId, setSessionUserId] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [coursesByDay, setCoursesByDay] = useState({});
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const initSession = async () => {
      const session = await ensureSession();
      if (isMounted) {
        const userId = session?.user?.id || null;
        setSessionUserId(userId);
        if (userId) {
          loadUser(userId).catch(() => {});
        }
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

  const handleLogin = async (username, password) => {
    setLoading(true);
    setError('');
    try {
      const session = await ensureSession();
      if (!session?.access_token) {
        throw new Error('Missing auth session');
      }
      const { data, error: invokeError } = await supabase.functions.invoke('gym-login', {
        body: { username, password },
      });
      if (invokeError) {
        throw invokeError;
      }
      const currentUserId = data?.user_id || session.user.id;
      await loadUser(currentUserId);
      await loadCourses(currentUserId);
    } catch (err) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const loadUser = async (id) => {
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
  };

  const loadCourses = async (id) => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('gym-courses', {
        body: { user_id: id },
      });
      if (invokeError) {
        throw invokeError;
      }
      setCoursesByDay(data?.by_day || {});
    } catch (err) {
      setCoursesByDay({});
      setNotice({ type: 'warning', message: 'Unable to load courses for this week.' });
    }
  };

  const updatePreferences = async (preferences) => {
    setLoading(true);
    setError('');
    try {
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
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
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
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {!user ? (
          <LoginForm onLogin={handleLogin} loading={loading} />
        ) : (
          <Dashboard
            user={user}
            coursesByDay={coursesByDay}
            onUpdatePreferences={updatePreferences}
            loading={loading}
          />
        )}
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

export default App;

async function ensureSession() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session) {
    return sessionData.session;
  }
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw error;
  }
  return data.session;
}



