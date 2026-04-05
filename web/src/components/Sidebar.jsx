import { TABS } from '../constants/calendar';

// Slide-in side menu for switching between preferences and calendar.
export default function Sidebar({
  user,
  activeTab,
  onTabChange,
  isOpen,
  onClose,
}) {
  return (
    <div className={`fixed inset-0 z-40 md:static md:z-auto ${isOpen ? '' : 'pointer-events-none'}`}>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className={`absolute inset-0 bg-black/30 transition md:hidden ${isOpen ? 'opacity-100' : 'opacity-0'}`}
      />
      <aside
        className={`absolute left-0 top-0 h-full w-64 border-r border-slate-200 bg-white p-4 shadow-xl transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 md:shadow-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Gym Bot</h1>
          <p className="text-xs text-slate-500">Weekly preferences and bookings</p>
        </div>
        {user?.credentials?.username && (
          <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Signed in as <span className="font-medium text-slate-800">{user.credentials.username}</span>
          </div>
        )}
        <div className="space-y-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                onTabChange(tab.id);
                onClose();
              }}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white shadow'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
