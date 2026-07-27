import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { StatusBar } from 'expo-status-bar';
import { QueryProvider } from './query-provider';
import { NetworkProvider } from './network-provider';
import { TrackingProvider } from './tracking-provider';
import { ToastHost } from '@/components/ui/toast';
import { MapAppPickerSheet } from '@/features/jobs/components/map-app-picker-sheet';
// Registers the foreground notification handler as a side effect of import — see
// the file for why nothing else from it is wired up yet.
import '@/services/notifications/push-notifications';

export function RootProvider({ children }: { children: React.ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <NetworkProvider>
            {/* Above the (driver) route group's auth redirect, not inside it — a
             * logout must be able to fire this provider's "stop tracking" effect
             * for the NEW (unauthenticated) status, which can't happen if the
             * redirect already unmounted the provider first. */}
            <TrackingProvider>
              <BottomSheetModalProvider>
                <StatusBar style="light" />
                {children}
                <MapAppPickerSheet />
                <ToastHost />
              </BottomSheetModalProvider>
            </TrackingProvider>
          </NetworkProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
