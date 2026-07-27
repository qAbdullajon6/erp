/// Mapbox public token + style helpers for Fleet Tracking (browser only).
/// Secret Mapbox APIs use MAPBOX_SECRET_TOKEN on the API — never import that here.

export const MAPBOX_PUBLIC_TOKEN =
  (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined)?.trim() || '';

export function isMapboxPublicTokenConfigured(): boolean {
  return MAPBOX_PUBLIC_TOKEN.length > 0 && MAPBOX_PUBLIC_TOKEN.startsWith('pk.');
}

export type FleetMapStyleMode = 'streets' | 'dark' | 'satellite' | 'navigation';

export function resolveFleetMapStyleMode(): FleetMapStyleMode {
  if (typeof document !== 'undefined') {
    if (document.documentElement.classList.contains('dark')) return 'dark';
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  }
  return 'streets';
}

export function mapboxStyleUrl(mode: FleetMapStyleMode = resolveFleetMapStyleMode()): string {
  switch (mode) {
    case 'dark':
      return 'mapbox://styles/mapbox/dark-v11';
    case 'satellite':
      return 'mapbox://styles/mapbox/satellite-streets-v12';
    case 'navigation':
      return 'mapbox://styles/mapbox/navigation-day-v1';
    case 'streets':
    default:
      return 'mapbox://styles/mapbox/streets-v12';
  }
}

export function mapboxTokenErrorMessage(): string {
  if (!MAPBOX_PUBLIC_TOKEN) {
    return 'VITE_MAPBOX_ACCESS_TOKEN is not set. Add a public Mapbox token (pk.*) to apps/web/.env.local.';
  }
  if (MAPBOX_PUBLIC_TOKEN.startsWith('sk.')) {
    return 'VITE_MAPBOX_ACCESS_TOKEN must be a public token (pk.*), not a secret token.';
  }
  return 'Mapbox public token is invalid.';
}
