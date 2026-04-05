import { useEffect, useState } from 'react';
import { WEEKDAYS } from '../constants/calendar';

// Preferences editor for selecting courses per weekday.
export default function Dashboard({ user, coursesByDay, onUpdatePreferences, loading }) {
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
    <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
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
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
          placeholder="Type to filter"
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
        />
      </div>

      {!hasCourses && (
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
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
            <div key={day} className="rounded-md border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-3 text-sm font-semibold text-slate-700">
                {day.charAt(0).toUpperCase() + day.slice(1)}
              </div>
              <div className="flex flex-wrap gap-2">
                {dayCourses.map((course) => {
                  const checked = (byDay[day] || []).includes(course);
                  return (
                    <label
                      key={`${day}-${course}`}
                      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm transition ${
                        checked
                          ? 'border-brand bg-brand text-white'
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
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark disabled:opacity-60"
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
