import { driverAPI, type DriverActionableStatus } from '@/services/api/endpoints/driver';
import { isClientError } from '@/services/api/error';
import { describeError } from '@/services/api/describe-error';
import { queryClient } from '@/services/api/query-client';
import { myDispatchKeys } from '@/services/api/query-keys';
import { useOfflineQueueStore, type QueuedStatusUpdate } from '@/store/offline-queue-store';

/**
 * The one queueable action in this app: a driver status update
 * (`POST /dispatches/my/:id/status`). Everything else a driver does is a read, and
 * reads don't queue — they just refetch once back online (React Query's own
 * `onlineManager` wiring, providers/query-provider.tsx, already handles that.)
 *
 * A queued item is replayed through the SAME `driverAPI.updateStatus` the online
 * path uses — no second code path for "the offline version of the request" to
 * drift from the first, matching the app-wide rule that transition legality is
 * decided exactly once, server-side.
 */

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function enqueueStatusUpdate(input: {
  dispatchId: string;
  dispatchNumber: string;
  status: DriverActionableStatus;
  note?: string;
}) {
  useOfflineQueueStore.getState().enqueue({
    id: generateId(),
    kind: 'dispatch-status-update',
    queuedAt: new Date().toISOString(),
    ...input,
  });
}

async function syncItem(item: QueuedStatusUpdate): Promise<void> {
  const store = useOfflineQueueStore.getState();
  store.markSyncing(item.id);

  try {
    await driverAPI.updateStatus(item.dispatchId, item.status, item.note);
    store.markSynced(item.id);
    queryClient.invalidateQueries({ queryKey: myDispatchKeys.all });
  } catch (error) {
    const message = describeError(error, 'Failed to sync this status update');
    if (isClientError(error)) {
      // The server considered this specific action and refused it — resending
      // the identical payload will refuse it again. Most often this means the
      // dispatch moved on through another channel while the phone was offline.
      store.markConflict(item.id, message);
    } else {
      store.markFailed(item.id, message);
    }
  }
}

let isDraining = false;

/** Replays every pending/failed item in queued order — sequentially, not in
 * parallel, because these are sequential lifecycle transitions
 * (EN_ROUTE_TO_PICKUP → AT_PICKUP → IN_TRANSIT → DELIVERED) for potentially the
 * same dispatch, and firing them out of order would ask the server to skip a
 * step. `conflict` items are excluded — they wait for the driver, see
 * store/offline-queue-store.ts. Safe to call repeatedly; re-entrant calls no-op. */
export async function drainOfflineQueue(): Promise<void> {
  if (isDraining) return;
  isDraining = true;

  try {
    const pending = useOfflineQueueStore
      .getState()
      .items.filter((item) => item.state === 'pending' || item.state === 'failed');

    for (const item of pending) {
      await syncItem(item);
    }
  } finally {
    isDraining = false;
  }
}

export function retryItem(id: string) {
  const item = useOfflineQueueStore.getState().items.find((entry) => entry.id === id);
  if (!item) return;
  useOfflineQueueStore.getState().resetToPending(id);
  void syncItem({ ...item, state: 'pending' });
}

export function discardItem(id: string) {
  useOfflineQueueStore.getState().remove(id);
}
