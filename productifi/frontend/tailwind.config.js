/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Sora', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#eef4ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#5B8CFF',
          500: '#5B8CFF',
          600: '#4a7ae6',
          700: '#8B5CF6',
          800: '#7c3aed',
          900: '#6d28d9',
          950: '#4c1d95',
        },
      },
      backgroundImage: {
        'gradient-productifi': 'linear-gradient(135deg, #2563eb 0%, #0d9488 100%)',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(91,140,255,0.08)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08), 0 8px 24px rgba(91,140,255,0.12)',
        'btn-glow': '0 0 20px rgba(91,140,255,0.4), 0 0 40px rgba(139,92,246,0.2)',
      },
      animation: {
        'pulse-slow': 'pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
