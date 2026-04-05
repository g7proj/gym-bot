// Header with identity and actions (menu toggle + refresh + logout).
export default function Header({
  user,
  onToggleMenu,
  onRefreshCourses,
  onLogout,
}) {
  return (
    <header className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMenu}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
          aria-label="Toggle menu"
        >
          <span className="text-lg font-semibold">=</span>
        </button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Gym Bot</h1>
          <p className="text-xs text-slate-500">Weekly preferences and bookings</p>
        </div>
      </div>
      {user && (
        <div className="flex items-center gap-2">
          <button
            onClick={onRefreshCourses}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            type="button"
          >
            Refresh courses
          </button>
          <button
            onClick={onLogout}
            className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-slate-800"
            type="button"
          >
            Logout
          </button>
        </div>
      )}
    </header>
  );
}
