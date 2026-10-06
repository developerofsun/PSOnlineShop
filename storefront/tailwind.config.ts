import type { Config } from 'tailwindcss';

// Grocery-store look: fresh green as the main color, orange for emphasis, red for discounts.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Vazirmatn Variable"', 'Vazirmatn', 'Tahoma', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        bump: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.35)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-3px)' },
          '40%, 80%': { transform: 'translateX(3px)' },
        },
      },
      animation: {
        bump: 'bump .25s ease-out',
        shake: 'shake .4s ease-in-out',
      },
      colors: {
        brand: {
          50: '#eef7ef',
          100: '#d4ebd7',
          500: '#3fa34d',
          600: '#2e8b3d',
          700: '#237030',
          800: '#1b5726',
        },
        accent: {
          50: '#fff4e5',
          500: '#f59e0b',
          600: '#e08600',
        },
      },
    },
  },
  plugins: [],
};

export default config;
