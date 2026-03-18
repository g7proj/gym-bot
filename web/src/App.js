import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const NOTICE_COLORS = {
  success: 'bg-green-600',
  info: 'bg-blue-600',
  warning: 'bg-yellow-600',
  error: 'bg-red-600',
};

function App() {
  const [userId, setUserId] = useState(localStorage.getItem('userId') || null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [coursesByDay, setCoursesByDay] = useState({});
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/wake`).catch(() => {});
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
      const response = await axios.post(`${API_BASE_URL}/login`, {
        username,
        password,
      });
      setUserId(response.data.user_id);
      localStorage.setItem('userId', response.data.user_id);
      await loadUser(response.data.user_id);
      await loadCourses(response.data.user_id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const loadUser = async (id) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/users/${id}`);
      setUser(response.data);
    } catch (err) {
      setError('Failed to load user data');
    }
  };

  const loadCourses = async (id) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/users/${id}/courses`);
      setCoursesByDay(response.data?.by_day || {});
    } catch (err) {
      setCoursesByDay({});
      setNotice({ type: 'warning', message: 'Unable to load courses for this week.' });
    }
  };

  const updatePreferences = async (preferences) => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.put(`${API_BASE_URL}/users/${userId}/preferences`, {
        ...preferences,
        username: user?.credentials?.username || null,
      });
      const updatedId = response.data?.user_id;
      if (updatedId && updatedId !== userId) {
        setUserId(updatedId);
        localStorage.setItem('userId', updatedId);
        await loadUser(updatedId);
        await loadCourses(updatedId);
      } else {
        await loadUser(userId);
        await loadCourses(userId);
      }
      setNotice({ type: 'success', message: 'Preferences updated.' });
    } catch (err) {
      setError('Failed to update preferences');
      setNotice({ type: 'error', message: 'Failed to update preferences.' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUserId(null);
    setUser(null);
    setCoursesByDay({});
    localStorage.removeItem('userId');
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-center mb-6 text-blue-600">Gym Bot</h1>

        {notice && (
          <div className={`fixed top-4 right-4 z-50 text-white px-4 py-2 rounded shadow-lg ${NOTICE_COLORS[notice.type]}`}>
            {notice.message}
          </div>
        )}
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {!userId ? (
          <LoginForm onLogin={handleLogin} loading={loading} />
        ) : (
          <Dashboard
            user={user}
            coursesByDay={coursesByDay}
            onReloadCourses={() => loadCourses(userId)}
            onUpdatePreferences={updatePreferences}
            onLogout={handleLogout}
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
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="username">
          Username
        </label>
        <input
          className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div className="mb-6">
        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
          Password
        </label>
        <input
          className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline"
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <div className="flex items-center justify-between">
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Logging in...' : 'Sign In'}
        </button>
      </div>
    </form>
  );
}

function Dashboard({ user, coursesByDay, onReloadCourses, onUpdatePreferences, onLogout, loading }) {
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
    <div>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Welcome, {user?.credentials?.username}!</h2>
          <p className="text-sm text-gray-600">Select the courses you want for each day.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onReloadCourses}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-1 px-3 rounded text-sm"
            type="button"
          >
            Refresh courses
          </button>
          <button
            onClick={onLogout}
            className="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-3 rounded text-sm"
            type="button"
          >
            Logout
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-2" htmlFor="courseFilter">
            Search courses
          </label>
          <input
            id="courseFilter"
            type="text"
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            placeholder="Type to filter"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
          />
        </div>

        {!hasCourses && (
          <div className="text-sm text-gray-600 mb-3">
            No courses found for this week. Try refreshing.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {WEEKDAYS.map((day) => {
            const dayCourses = (coursesByDay[day] || []).filter((course) => {
              if (!filterValue) return true;
              return course.includes(filterValue);
            });

            return (
              <div key={day} className="border rounded p-3">
                <div className="text-sm font-semibold mb-2">
                  {day.charAt(0).toUpperCase() + day.slice(1)}
                </div>
                <div className="flex flex-wrap gap-3">
                  {dayCourses.map((course) => (
                    <label key={`${day}-${course}`} className="inline-flex items-center">
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={(byDay[day] || []).includes(course)}
                        onChange={() => toggleCourseForDay(day, course)}
                      />
                      {course.charAt(0).toUpperCase() + course.slice(1)}
                    </label>
                  ))}
                  {dayCourses.length === 0 && (
                    <span className="text-sm text-gray-500">No courses</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Updating...' : 'Update Preferences'}
        </button>
      </form>
    </div>
  );
}

export default App;
