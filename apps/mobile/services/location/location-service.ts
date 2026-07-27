import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { useTrackingStore } from '@/store/tracking-store';

/**
 * Permission plumbing for BOTH of location's real uses in this app:
 *
 *   - Foreground: GPS tracking (services/tracking/*, Phase 3) while a dispatch
 *     is live, plus handing a destination to the device's Maps app and
 *     tagging POD photos (features/pod).
 *   - Background ("Allow all the time"): what lets GPS tracking keep posting
 *     positions while the app isn't in the foreground — a deliberate,
 *     separate ask from Account, never bundled into the foreground request
 *     (platform guidelines expect this, and so does a driver who should know
 *     exactly what they're granting).
 *
 * Both hooks mirror their live status into store/tracking-store.ts, which is
 * the single source of truth providers/tracking-provider.tsx reads to decide
 * whether tracking can start — granting permission from Account re-triggers
 * that decision immediately instead of waiting for some unrelated state
 * change to happen to re-check it.
 */
export function useForegroundLocationPermission() {
  const [status, setStatus] = useState<Location.PermissionStatus | null>(null);

  useEffect(() => {
    Location.getForegroundPermissionsAsync().then((result) => {
      setStatus(result.status);
      useTrackingStore.getState().setPermissions({ foreground: result.status === Location.PermissionStatus.GRANTED });
    });
  }, []);

  const request = useCallback(async () => {
    const result = await Location.requestForegroundPermissionsAsync();
    setStatus(result.status);
    useTrackingStore.getState().setPermissions({ foreground: result.status === Location.PermissionStatus.GRANTED });
    return result.status;
  }, []);

  return { status, request, isGranted: status === Location.PermissionStatus.GRANTED };
}

export function useBackgroundLocationPermission() {
  const [status, setStatus] = useState<Location.PermissionStatus | null>(null);

  useEffect(() => {
    Location.getBackgroundPermissionsAsync().then((result) => {
      setStatus(result.status);
      useTrackingStore.getState().setPermissions({ background: result.status === Location.PermissionStatus.GRANTED });
    });
  }, []);

  const request = useCallback(async () => {
    // Android/iOS both require foreground permission to already be granted
    // before background can be requested — asking otherwise either no-ops or
    // is rejected outright by the OS, so this is enforced here rather than
    // producing a confusing silent failure.
    const foreground = await Location.getForegroundPermissionsAsync();
    if (foreground.status !== Location.PermissionStatus.GRANTED) {
      const upgraded = await Location.requestForegroundPermissionsAsync();
      if (upgraded.status !== Location.PermissionStatus.GRANTED) {
        return upgraded.status;
      }
    }
    const result = await Location.requestBackgroundPermissionsAsync();
    setStatus(result.status);
    useTrackingStore.getState().setPermissions({ background: result.status === Location.PermissionStatus.GRANTED });
    return result.status;
  }, []);

  return { status, request, isGranted: status === Location.PermissionStatus.GRANTED };
}
