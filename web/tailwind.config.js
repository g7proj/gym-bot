/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#2a9d8f',
          dark: '#21867a',
        },
        accent: {
          DEFAULT: '#5aa7d6',
          dark: '#2d6f9a',
        },
        success: {
          DEFAULT: '#3aa981',
          soft: '#dff3ec',
          deep: '#1f7f66',
        },
        info: {
          DEFAULT: '#5aa7d6',
          soft: '#dbeaf6',
          deep: '#2d6f9a',
        },
        warning: {
          DEFAULT: '#e6b05b',
          soft: '#f9ebd2',
          deep: '#a9701f',
        },
        danger: {
          DEFAULT: '#e07a7a',
          soft: '#f7dede',
          deep: '#a84b4b',
        },
        'opal-mist': '#eaf7f4',
        'opal-pearl': '#f3f0ff',
        'opal-sky': '#e7f3ff',
        surface: '#ffffff',
        'surface-soft': '#f7fbfb',
        'surface-alt': '#eef6f7',
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
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '28': '7rem',
        '30': '7.5rem',
      },
      borderRadius: {
        md: '0.375rem',
        lg: '0.5rem',
      },
      boxShadow: {
        soft: '0 10px 30px -20px rgba(36, 89, 86, 0.35)',
      },
    },
  },
  plugins: [],
};
