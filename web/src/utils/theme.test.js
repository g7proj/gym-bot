import { applyTheme, getInitialTheme } from './theme';

describe('theme utilities', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', '#f8fafc');
  });

  test('getInitialTheme reads stored preference and falls back to light', () => {
    expect(getInitialTheme()).toBe('light');

    window.localStorage.setItem('gym-bot-theme', 'dark');
    expect(getInitialTheme()).toBe('dark');

    window.localStorage.setItem('gym-bot-theme', 'light');
    expect(getInitialTheme()).toBe('light');
  });

  test('applyTheme toggles html.dark class, meta theme-color, and localStorage', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#020617');
    expect(window.localStorage.getItem('gym-bot-theme')).toBe('dark');

    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#f8fafc');
    expect(window.localStorage.getItem('gym-bot-theme')).toBe('light');
  });
});
