import type { Config } from 'tailwindcss';

// Neighbourhood-grocer look: deep leaf green, saffron for price tags and badges, warm stone greys instead of cool slate.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Estedad Variable"', '"Vazirmatn Variable"', 'Tahoma', 'system-ui', 'sans-serif'],
        // Same family, used with a heavier weight (see .font-display in globals.css).
        display: ['"Estedad Variable"', '"Vazirmatn Variable"', 'Tahoma', 'sans-serif'],
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
        // Every existing `slate-*` class now resolves to a warm grey, so the whole UI loses its cold blue tint.
        slate: {
          50: '#f8f7f4',
          100: '#f1efea',
          200: '#e4e1da',
          300: '#cfcbc2',
          400: '#a29d92',
          500: '#78736a',
          600: '#5c584f',
          700: '#46433b',
          800: '#2f2d28',
          900: '#1f1e1a',
        },
        // Main green: rgb(40,167,69) = #28a745 (600). 700 is the hover/pressed shade, 800-900 are for headings.
        brand: {
          50: '#eef8f1',
          100: '#d3eedb',
          500: '#3cb85b',
          600: '#28a745',
          700: '#208a39',
          800: '#1a6e2e',
          900: '#134f21',
        },
        // Saffron: price tags, badges, the cart counter.
        accent: {
          50: '#fff6dc',
          100: '#fde9a6',
          500: '#f0b429',
          600: '#d99a0b',
        },
        sale: '#b8321f',
      },
    },
  },
  plugins: [],
};

export default config;
