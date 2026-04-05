import { TABS } from '../constants/calendar';

// Header with identity, actions, and tab switcher.
export default function Header({
  user,
  activeTab,
  onTabChange,
  onRefreshCourses,
  onLogout,
}) {
  return (
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
              onClick={onRefreshCourses}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              type="button"
            >
              Refresh courses
            </button>
            <button
              onClick={onLogout}
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
              onClick={() => onTabChange(tab.id)}
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
  );
}
