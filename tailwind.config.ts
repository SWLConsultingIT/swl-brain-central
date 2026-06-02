import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg:            'var(--color-bg)',
        fg:            'var(--color-fg)',
        card:          'var(--color-card)',
        'card-hover':  'var(--color-card-hover)',
        muted:         'var(--color-muted)',
        'muted-fg':    'var(--color-muted-fg)',
        border:        'var(--color-border)',
        'border-hover': 'var(--color-border-hover)',
        accent:        'var(--color-accent)',
        destructive:   'var(--color-destructive)',
        warning:       'var(--color-warning)',
        info:          'var(--color-info)',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)',
        'card-hover': '0 4px 8px 0 rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)',
      },
    },
  },
  plugins: [],
}

export default config
