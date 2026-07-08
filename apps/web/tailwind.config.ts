import type { Config } from 'tailwindcss';

const config: Config = {
  theme: {
    colors: {
      destructive: 'var(--destructive)',
      'destructive-foreground': 'var(--destructive-foreground)',
      success: 'var(--success)',
      warning: 'var(--warning)',
    },
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: 'var(--card)',
        'card-foreground': 'var(--card-foreground)',
        popover: 'var(--popover)',
        'popover-foreground': 'var(--popover-foreground)',
        primary: 'var(--primary)',
        'primary-foreground': 'var(--primary-foreground)',
        secondary: 'var(--secondary)',
        'secondary-foreground': 'var(--secondary-foreground)',
        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',
        accent: 'var(--accent)',
        'accent-foreground': 'var(--accent-foreground)',
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',

        surface: 'var(--surface)',
        'surface-elevated': 'var(--surface-elevated)',
        brand: 'var(--brand)',
        'brand-foreground': 'var(--brand-foreground)',
        'brand-glow': 'var(--brand-glow)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['var(--font-manrope)', 'var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      borderRadius: {
        sm: 'calc(var(--radius) - 4px)',
        md: 'calc(var(--radius) - 2px)',
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
        '3xl': 'calc(var(--radius) + 12px)',
      },
      boxShadow: {
        elevated: 'var(--shadow-elevated)',
        brand: 'var(--shadow-glow)',
        glow: 'var(--shadow-glow)',
      },
      backgroundImage: {
        'gradient-brand': 'var(--gradient-brand)',
        'hero-glow': 'var(--gradient-hero)',
      },
    },
  },
};

export default config;
