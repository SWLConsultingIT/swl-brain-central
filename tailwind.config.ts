import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        bg:             'var(--color-bg)',
        surface:        'var(--color-surface)',
        'surface-hover':'var(--color-surface-hover)',
        fg:             'var(--color-fg)',
        'fg-muted':     'var(--color-fg-muted)',
        'fg-subtle':    'var(--color-fg-subtle)',
        border:         'var(--color-border)',
        'border-strong':'var(--color-border-strong)',
        'border-focus': 'var(--color-border-focus)',

        accent:         'var(--color-accent)',
        'accent-bg':    'var(--color-accent-bg)',
        'accent-fg':    'var(--color-accent-fg)',

        warning:        'var(--color-warning)',
        'warning-bg':   'var(--color-warning-bg)',

        info:           'var(--color-info)',
        'info-bg':      'var(--color-info-bg)',

        destructive:    'var(--color-destructive)',
        'destructive-bg':'var(--color-destructive-bg)',

        violet:         'var(--color-violet)',
        'violet-bg':    'var(--color-violet-bg)',

        fuchsia:        'var(--color-fuchsia)',
        'fuchsia-bg':   'var(--color-fuchsia-bg)',

        orange:         'var(--color-orange)',
        'orange-bg':    'var(--color-orange-bg)',

        slate:          'var(--color-slate)',
        'slate-bg':     'var(--color-slate-bg)',
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 0 0 1px rgba(15, 23, 42, 0.04)',
        'soft-hover': '0 4px 8px -2px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.08)',
        focus: '0 0 0 3px rgba(5, 150, 105, 0.15)',
      },
    },
  },
  plugins: [],
}

export default config
