/**
 * Raw color values for native code paths that can't consume Tailwind classes
 * (StatusBar, native Alert, icon `color` props, chart libraries). Kept in
 * sync by hand with the RGB triplets in `global.css` — both are converted
 * from the web app's OKLCH tokens (apps/web/src/styles.css) so the driver
 * app and the web app read as the same product.
 */
export const colors = {
  background: '#0a1423',
  foreground: '#f6f9fb',

  surface: '#121d2f',
  surfaceElevated: '#1b273a',

  card: '#121d2f',
  cardForeground: '#f6f9fb',

  primary: '#319cfc',
  primaryForeground: '#050b18',

  secondary: '#1d293d',
  secondaryForeground: '#f6f9fb',

  muted: '#1c2738',
  mutedForeground: '#9ba6b1',

  accent: '#1c2f46',
  accentForeground: '#f6f9fb',

  destructive: '#ee343b',
  destructiveForeground: '#f6f9fb',

  success: '#35c177',
  warning: '#f2a618',

  border: '#27334a',
} as const;

export type ColorToken = keyof typeof colors;
