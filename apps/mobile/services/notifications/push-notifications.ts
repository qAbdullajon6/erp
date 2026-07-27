import { useCallback, useEffect, useState } from 'react';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Push notification ARCHITECTURE only (per the mobile foundation spec: "Prepare
 * push notification architecture. Do not implement business logic yet."). Two
 * things are real and active — the foreground handler below, and permission
 * request/status via `useNotificationPermission` — because both are pure device
 * behavior with no backend involved.
 *
 * `getExpoPushToken` and `registerPushToken` are NOT called anywhere in the app.
 * Wiring them up for real needs two things that don't exist yet: an EAS project id
 * (`app.json`'s `extra.eas.projectId`, only assigned once this app is registered
 * with `eas init`) and a backend endpoint to receive the token — apps/api has no
 * such endpoint today (verified: no route matches push-token/device-token/FCM/APNs
 * anywhere in apps/api/src). Calling `getExpoPushTokenAsync` without a project id
 * throws, so this is left as a function ready to call once both exist rather than
 * one that silently no-ops or fakes success.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function useNotificationPermission() {
  const [status, setStatus] = useState<Notifications.PermissionStatus | null>(null);

  useEffect(() => {
    Notifications.getPermissionsAsync().then((result) => setStatus(result.status));
  }, []);

  const request = useCallback(async () => {
    const result = await Notifications.requestPermissionsAsync();
    setStatus(result.status);
    return result.status;
  }, []);

  return { status, request, isGranted: status === 'granted' };
}

/** Not called anywhere yet — see the file header. Kept ready so wiring up push
 * delivery later is "call this and POST the result," not a new design. */
export async function getExpoPushToken(): Promise<string> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    throw new Error(
      'No EAS project id configured (app.json extra.eas.projectId) — run `eas init` before requesting a push token.',
    );
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}
