import { useEffect, useRef, useState } from 'react';
import { TABS } from '../constants/calendar';

// Sticky mobile-first top navigation bar with direct tab switcher, theme toggle, and user menu.
export default function Header({
  user,
  activeTab,
  onTabChange,
  theme,
  onToggleTheme,
  onOpenChangePassword,
  onLogout,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const username = user?.credentials?.username || '';
  const initial = username ? username.charAt(0).toUpperCase() : 'U';
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/85">
      <div className="mx-auto max-w-5xl px-3 sm:px-6">
        <div className="flex min-h-[3.25rem] items-center justify-between gap-2 py-2">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-brand text-white shadow-sm">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11" />
              </svg>
            </div>
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Gym Bot
            </span>
          </div>

          {/* Inline tab switcher on sm+ */}
          {user && (
            <nav
              aria-label="Main navigation"
              className="hidden items-center rounded border border-slate-200/80 bg-slate-100/90 p-0.5 dark:border-slate-800 dark:bg-slate-800/80 sm:flex"
            >
              {TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onTabChange(tab.id)}
                    className={`rounded-sm px-3.5 py-1 text-xs font-semibold transition ${
                      active
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          )}

          {/* Theme toggle + User dropdown */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              title={isDark ? 'Light mode' : 'Dark mode'}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {isDark ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
                </svg>
              )}
            </button>

            {user && (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-expanded={menuOpen}
                  aria-label="Account menu"
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-200 bg-white pl-1.5 pr-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-brand/15 text-[11px] font-bold text-brand dark:bg-brand-light/20 dark:text-brand-light">
                    {initial}
                  </span>
                  <span className="hidden max-w-[110px] truncate sm:inline">{username || 'Account'}</span>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-slate-400" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-1.5 w-52 origin-top-right rounded-md border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                    {username && (
                      <div className="mb-1 border-b border-slate-100 px-2.5 py-1.5 dark:border-slate-800">
                        <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                          Signed in as
                        </div>
                        <div className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {username}
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenChangePassword();
                      }}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Change password
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onLogout();
                      }}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs font-medium text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Full-width thumb-friendly segmented tabs on mobile (< sm) */}
        {user && (
          <nav
            aria-label="Mobile navigation"
            className="mb-2 grid grid-cols-2 gap-1 rounded border border-slate-200/80 bg-slate-100/90 p-0.5 dark:border-slate-800 dark:bg-slate-800/80 sm:hidden"
          >
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={`rounded-sm py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
}
