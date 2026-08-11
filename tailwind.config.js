/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#fdf4ee',
          100: '#fbe5d4',
          200: '#f6c9a9',
          300: '#f0a472',
          400: '#e97540',
          500: '#e35a1f',
          600: '#c94114',
          700: '#a73012',
          800: '#882917',
          900: '#6f2416',
          950: '#3d0e08',
        },
        parchment: {
          50:  '#fdfbf7',
          100: '#f9f4e8',
          200: '#f2e8d0',
          300: '#e8d5ae',
          400: '#dbbe86',
          500: '#cfa463',
          600: '#be8c4a',
          700: '#9e713d',
          800: '#805b37',
          900: '#694b2f',
          950: '#382515',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],
      },
    },
  },
  plugins: [],
}
