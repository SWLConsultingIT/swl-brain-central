import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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
        soft: '0 1px 2px 0 rgba(10, 10, 10, 0.03), 0 0 0 1px rgba(10, 10, 10, 0.04)',
        'soft-hover': '0 6px 16px -4px rgba(10, 10, 10, 0.08), 0 2px 4px -2px rgba(10, 10, 10, 0.04), 0 0 0 1px rgba(10, 10, 10, 0.08)',
        'card': '0 1px 2px 0 rgba(10, 10, 10, 0.04)',
        'card-hover': '0 8px 24px -6px rgba(10, 10, 10, 0.10), 0 0 0 1px rgba(10, 10, 10, 0.06)',
        focus: '0 0 0 3px rgba(10, 10, 10, 0.10)',
      },
    },
  },
  plugins: [],
}

export default config
