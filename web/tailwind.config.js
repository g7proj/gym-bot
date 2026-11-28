/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0d9488',
          dark: '#0f766e',
          light: '#14b8a6',
        },
        accent: {
          DEFAULT: '#38bdf8',
          dark: '#0284c7',
        },
        success: {
          DEFAULT: '#10b981',
          soft: '#d1fae5',
          deep: '#065f46',
        },
        info: {
          DEFAULT: '#0ea5e9',
          soft: '#e0f2fe',
          deep: '#075985',
        },
        warning: {
          DEFAULT: '#f59e0b',
          soft: '#fef3c7',
          deep: '#92400e',
        },
        danger: {
          DEFAULT: '#f43f5e',
          soft: '#ffe4e6',
          deep: '#9f1239',
        },
      },
      fontFamily: {
        sans: [
          'Sora',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
