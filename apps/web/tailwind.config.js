/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4176B5',
          50: '#E8F0F8',
          100: '#D1E1F1',
          200: '#A3C3E3',
          300: '#75A5D5',
          400: '#4787C7',
          500: '#4176B5',
          600: '#23498A',
          700: '#1A3666',
          800: '#112443',
          900: '#08121F',
        },
        accent: {
          DEFAULT: '#679C5A',
          50: '#EFF5ED',
          100: '#DFEBDB',
          200: '#BFD7B7',
          300: '#9FC393',
          400: '#7FAF6F',
          500: '#679C5A',
          600: '#527D48',
          700: '#3E5E36',
          800: '#293F24',
          900: '#151F12',
        },
        surface: '#FFFFFF',
        background: '#F7FAFC',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Montserrat', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 6px 18px rgba(35,73,138,0.06)',
        'card-hover': '0 8px 24px rgba(35,73,138,0.10)',
      },
    },
  },
  plugins: [],
};
