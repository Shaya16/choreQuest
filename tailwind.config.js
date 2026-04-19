/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Locked 10-color arcade palette per PROJECT_BRIEF.md §3
      colors: {
        bg: '#000000',
        yellow: '#FFCC00',
        red: '#FF3333',
        cyan: '#00DDFF',
        pink: '#FFB8DE',
        orange: '#FFA63F',
        white: '#FFFFFF',
        blue: '#2121FF',
        lime: '#9EFA00',
        gray: '#4A4A4A',
      },
      fontFamily: {
        arcade: ['PressStart2P'],
        arcadeSmall: ['Silkscreen'],
      },
    },
  },
  plugins: [],
};
