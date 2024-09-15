/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/renderer/**/*.{html,js}",
  ],
  theme: {
    extend: {
      colors: {
        debug: {
          light: '#6B7280', // gray-500
          dark: '#9CA3AF'   // gray-400
        },
        info: {
          light: '#3B82F6', // blue-500
          dark: '#60A5FA'   // blue-400
        },
        warn: {
          light: '#EAB308', // yellow-500
          dark: '#FACC15'   // yellow-400
        },
        error: {
          light: '#EF4444', // red-500
          dark: '#F87171'   // red-400
        }
      }
    },
  },
  plugins: [],
}

