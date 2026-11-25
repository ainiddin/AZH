import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f6f4ef',
        ink: '#141414',
        muted: '#7a766e',
        line: '#e6e1d6',
        soft: '#efebe2',
        gold: '#b08d57',
        pos: '#2f7a4f',
        neg: '#b3402f',
        warn: '#7a5a1d'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif']
      }
    }
  },
  plugins: []
} satisfies Config
