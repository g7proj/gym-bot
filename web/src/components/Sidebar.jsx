import { TABS } from '../constants/calendar';

// Slide-in side menu for switching between preferences and calendar.
export default function Sidebar({
  user,
  activeTab,
  onTabChange,
  isOpen,
  onClose,
}) {
  const shouldCloseOnSelect = () => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(min-width: 768px)').matches;
  };

  return (
    <div className={`fixed inset-0 z-40 md:static md:z-auto ${isOpen ? '' : 'pointer-events-none'}`}>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className={`absolute inset-0 z-10 bg-black/30 transition md:hidden ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />
      <aside
        className={`absolute left-0 top-0 z-20 h-full w-64 border-r border-slate-200 bg-white p-4 shadow-xl transition-transform md:relative md:h-full md:shadow-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Gym Bot</h1>
          <p className="text-xs text-slate-500">Weekly preferences and bookings</p>
        </div>
        {user?.credentials?.username && (
          <div className="mb-6 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
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
                if (shouldCloseOnSelect()) {
                  onClose();
                }
              }}
              className={`w-full rounded-md px-3 py-2 text-left text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-brand text-white shadow'
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
