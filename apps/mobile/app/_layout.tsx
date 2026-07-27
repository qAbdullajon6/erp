import '@/global.css';
// Defines the background location TaskManager task as a side effect of import.
// Must run at module-evaluation time, unconditionally, before anything calls
// `Location.startLocationUpdatesAsync` — and on every cold start, since the OS
// re-invokes this same task after relaunching the app for a background
// update and needs `defineTask` to have already run. See the file itself for
// why this can't just live inside a component.
import '@/services/tracking/location-task';

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { RootProvider } from '@/providers/root-provider';
import { useAuthStore } from '@/store/auth-store';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const sessionStatus = useAuthStore((state) => state.status);
  const [hasHydrated, setHasHydrated] = useState(useAuthStore.persist.hasHydrated());

  // `persist`'s rehydration read from SecureStore is async and races the first
  // render — the router must not decide "show login" before it knows whether a
  // saved session actually exists, or a driver who force-quit the app mid-shift
  // would see a login flash every time they reopen it.
  useEffect(() => {
    if (hasHydrated) return;
    return useAuthStore.persist.onFinishHydration(() => setHasHydrated(true));
  }, [hasHydrated]);

  const isReady = fontsLoaded && hasHydrated && sessionStatus !== 'restoring';

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [isReady]);

  if (!isReady) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <RootProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(driver)" />
      </Stack>
    </RootProvider>
  );
}
