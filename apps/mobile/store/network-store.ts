import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';

/**
 * Three distinct states a driver needs to be told apart, not just "online/offline":
 *
 *   offline            NetInfo says there is no connection at all. Nothing will
 *                       work; queue writes, don't retry reads.
 *   server-unavailable  The device HAS a connection, but requests to our API keep
 *                       failing (timeouts, 5xx, connection refused) — the backend
 *                       is down or unreachable, not the phone's radio. A driver
 *                       on a real network with no signal to OUR server needs a
 *                       different message than "check your phone's wifi."
 *   online              Recent requests are succeeding, or none have been tried
 *                       yet since the last known-good state.
 *
 * `apiFetch` (services/api/client.ts) reports every request's outcome here — this
 * store never polls or guesses; it only reflects what real traffic just told it.
 */
export type ConnectionStatus = 'online' | 'offline' | 'server-unavailable';

interface NetworkState {
  isDeviceConnected: boolean;
  /** Consecutive network/server failures since the last success. Reset to 0 on any
   * successful response (including a 4xx — the server answered, so it's reachable). */
  consecutiveFailures: number;
  status: ConnectionStatus;
  reportSuccess: () => void;
  /** `kind: 'network'` is a transport failure (fetch threw — no route to host, DNS,
   * timeout). `kind: 'server'` is a 5xx — the request reached the server and it
   * failed to handle it. Both count toward "can't reach the API right now"; kept
   * distinct only because they log differently, never surfaced to the UI as
   * different states. */
  reportFailure: (kind: 'network' | 'server') => void;
}

/** Two failures in a row before declaring the server unavailable — one flaky
 * request (a dropped packet, a cold Lambda) shouldn't flip a banner on and off. */
const FAILURE_THRESHOLD = 2;

function deriveStatus(isDeviceConnected: boolean, consecutiveFailures: number): ConnectionStatus {
  if (!isDeviceConnected) return 'offline';
  if (consecutiveFailures >= FAILURE_THRESHOLD) return 'server-unavailable';
  return 'online';
}

export const useNetworkStore = create<NetworkState>()((set, get) => ({
  isDeviceConnected: true,
  consecutiveFailures: 0,
  status: 'online',

  reportSuccess: () => {
    if (get().consecutiveFailures === 0) return;
    set((state) => ({
      consecutiveFailures: 0,
      status: deriveStatus(state.isDeviceConnected, 0),
    }));
  },

  reportFailure: () => {
    set((state) => {
      const consecutiveFailures = state.consecutiveFailures + 1;
      return { consecutiveFailures, status: deriveStatus(state.isDeviceConnected, consecutiveFailures) };
    });
  },
}));

/** Called once from providers/root-provider.tsx. Kept out of the store's own
 * module-init so tests (or a future non-RN runtime) don't get a live NetInfo
 * subscription just by importing the store. */
export function bootstrapNetworkMonitoring(): () => void {
  return NetInfo.addEventListener((state) => {
    const isDeviceConnected = state.isConnected !== false;
    useNetworkStore.setState((prev) => ({
      isDeviceConnected,
      status: deriveStatus(isDeviceConnected, prev.consecutiveFailures),
    }));
  });
}
