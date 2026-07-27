import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/** Live connectivity for UI that needs to show an offline banner or disable a submit
 * button. Separate from the TanStack Query <-> NetInfo wiring in
 * providers/query-provider.tsx, which governs retry/refetch behavior — this is purely
 * for what the screen displays. */
export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected !== false);
    });
  }, []);

  return { isConnected };
}

export async function getIsConnected(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected !== false;
}
