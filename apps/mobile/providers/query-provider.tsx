import { useEffect } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { queryClient } from '@/services/api/query-client';

// TanStack Query's documented React Native wiring: without this it has no way to
// know the phone lost signal, so a mutation fired while offline just sits retrying
// against a dead socket instead of pausing, and "refetch on reconnect" never fires
// because nothing ever told it a reconnect happened.
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(state.isConnected != null ? state.isConnected : true);
  });
});

function onAppStateChange(status: AppStateStatus) {
  // Web's equivalent is "did the browser tab regain focus"; on a phone the
  // equivalent moment is "did the app come back to the foreground" — that's when a
  // driver reopening the app after ten minutes on a phone call should see fresh
  // data, not what was cached when they backgrounded it.
  if (Platform.OS !== 'web') {
    focusManager.setFocused(status === 'active');
  }
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
