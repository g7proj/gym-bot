const THEME_STORAGE_KEY = 'gym-bot-theme';
const LIGHT_THEME_COLOR = '#f8fafc';
const DARK_THEME_COLOR = '#020617';

/** Resolve the initial UI theme ('light' or 'dark') from localStorage or OS preference. */
export function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
  } catch (_err) {
    // Ignore storage access errors in restricted webviews.
  }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/** Apply the selected theme to `<html>`, `<meta name="theme-color">`, and localStorage. */
export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const isDark = theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', isDark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
  } catch (_err) {
    // Ignore storage write errors.
  }
}
