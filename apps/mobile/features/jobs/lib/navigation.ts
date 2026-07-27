import { Linking, Platform } from 'react-native';
import { useNavigationPreferenceStore, type MapApp } from '@/store/navigation-preference-store';
import { useMapPickerStore } from '@/store/map-picker-store';

/**
 * Hands the destination off to a real navigation app rather than drawing a map
 * in-app — there is no live-tracking or turn-by-turn backend to power an in-app
 * map (see services/location/location-service.ts), so a real handoff is a
 * genuinely working feature today, not a placeholder for one.
 */

export interface MapAppOption {
  id: MapApp;
  name: string;
  /** Only meaningful for a real device — canOpenURL always resolves false in the
   * browser/web preview target, so callers should treat "not detected" there as
   * "unknown," not "not installed." */
  isAvailable: boolean;
}

function buildUrl(app: MapApp, address: string, city: string): { primary: string; fallback: string } {
  const query = encodeURIComponent(`${address}, ${city}`);
  switch (app) {
    case 'apple':
      return { primary: `maps://?daddr=${query}&dirflg=d`, fallback: `https://maps.apple.com/?daddr=${query}` };
    case 'google':
      return {
        primary: `comgooglemaps://?daddr=${query}&directionsmode=driving`,
        fallback: `https://www.google.com/maps/dir/?api=1&destination=${query}`,
      };
    case 'waze':
      return { primary: `waze://?q=${query}&navigate=yes`, fallback: `https://waze.com/ul?q=${query}&navigate=yes` };
  }
}

export async function openInMapApp(app: MapApp, address: string, city: string): Promise<void> {
  const { primary, fallback } = buildUrl(app, address, city);
  const canOpenNative = await Linking.canOpenURL(primary).catch(() => false);
  await Linking.openURL(canOpenNative ? primary : fallback);
}

/** Google Maps and Waze are cross-platform; Apple Maps only exists on iOS.
 * `isAvailable` reflects a real `canOpenURL` check — declared in app.json's
 * `ios.infoPlist.LSApplicationQueriesSchemes` so iOS actually answers truthfully
 * instead of always returning false for undeclared schemes. */
export async function getAvailableMapApps(): Promise<MapAppOption[]> {
  const candidates: { id: MapApp; name: string; scheme: string }[] = [
    ...(Platform.OS === 'ios' ? [{ id: 'apple' as const, name: 'Apple Maps', scheme: 'maps://' }] : []),
    { id: 'google', name: 'Google Maps', scheme: 'comgooglemaps://' },
    { id: 'waze', name: 'Waze', scheme: 'waze://' },
  ];

  return Promise.all(
    candidates.map(async ({ id, name, scheme }) => ({
      id,
      name,
      isAvailable: await Linking.canOpenURL(scheme).catch(() => false),
    })),
  );
}

/** The entry point every screen calls to start turn-by-turn navigation. A driver
 * who's already chosen "always use this app" skips the picker entirely; everyone
 * else sees it (features/jobs/components/map-app-picker-sheet.tsx, mounted once
 * globally and watching store/map-picker-store.ts). */
export function promptNavigate(address: string, city: string) {
  const preferredApp = useNavigationPreferenceStore.getState().preferredApp;
  if (preferredApp) {
    void openInMapApp(preferredApp, address, city);
    return;
  }
  useMapPickerStore.getState().open({ address, city });
}

export function callPhone(phone: string) {
  return Linking.openURL(`tel:${phone}`);
}
