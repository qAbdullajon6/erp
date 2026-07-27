import { useEffect } from 'react';
import { AppState } from 'react-native';
import { bootstrapNetworkMonitoring, useNetworkStore } from '@/store/network-store';
import { drainOfflineQueue } from '@/services/offline/offline-queue';
import { useOfflineQueueStore } from '@/store/offline-queue-store';
import { flushTrackingQueue } from '@/services/tracking/tracking-queue';
import { useTrackingQueueStore } from '@/store/tracking-queue-store';
import { useTrackingStore } from '@/store/tracking-store';
import { stopTracking } from '@/services/tracking/tracking-orchestrator';

/** How often to retry stalled queue items while online but not actively told
 * about a fresh reconnect — covers the case where connectivity returned while the
 * app was backgrounded and the NetInfo transition happened before this provider
 * was listening again. Not aggressive: these are already-failed attempts, and
 * hammering a server that just came back up is its own way to keep it down. */
const BACKGROUND_RETRY_INTERVAL_MS = 20_000;

async function flushTrackingQueueIfTracking() {
  if (useTrackingStore.getState().lifecycleStatus !== 'tracking') return;
  const outcome = await flushTrackingQueue();
  if (outcome.shouldStopTracking) {
    await stopTracking('server-rejected');
  }
}

/** Starts the one live NetInfo subscription the whole app shares (store/network-
 * store.ts), and drains BOTH offline queues — status updates
 * (services/offline/offline-queue.ts) and GPS positions
 * (services/tracking/tracking-queue.ts) — on every reconnect signal. A driver
 * who queued status updates or GPS fixes in a tunnel shouldn't have to open the
 * app back up or pull-to-refresh to get them sent; this is docs/
 * DRIVER_MOBILE_GPS.md §6's "Reconnect: POST backlog oldest-first" made real.
 */
export function NetworkProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => bootstrapNetworkMonitoring(), []);

  useEffect(() => {
    return useNetworkStore.subscribe((state, prevState) => {
      const justReconnected = prevState.status !== 'online' && state.status === 'online';
      if (justReconnected) {
        void drainOfflineQueue();
        void flushTrackingQueueIfTracking();
      }
    });
  }, []);

  // App-foreground is the other moment worth an immediate drain attempt — the
  // NetInfo listener above only fires on an actual connectivity transition, which
  // a backgrounded app can miss entirely if it was suspended through it.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && useNetworkStore.getState().status === 'online') {
        void drainOfflineQueue();
        void flushTrackingQueueIfTracking();
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const { status } = useNetworkStore.getState();
      if (status !== 'online') return;

      const hasRetryableItems = useOfflineQueueStore.getState().items.some((item) => item.state === 'failed');
      if (hasRetryableItems) void drainOfflineQueue();

      if (useTrackingQueueStore.getState().positions.length > 0) void flushTrackingQueueIfTracking();
    }, BACKGROUND_RETRY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return children;
}
