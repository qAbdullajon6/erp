import { isClientError } from '@/services/api/error';
import { describeError } from '@/services/api/describe-error';
import { useTrackingQueueStore } from '@/store/tracking-queue-store';
import { useTrackingStore } from '@/store/tracking-store';
import { trackingAPI } from './tracking-api';
import { MAX_FLUSH_ATTEMPT_SIZE } from './tracking-config';

export interface FlushOutcome {
  /** True when the server told us tracking cannot continue right now — no
   * live dispatch (404) or the dispatch has no vehicle (400). Both are
   * per-request rejections, not per-position ones (docs/DRIVER_MOBILE_GPS.md
   * §5): the orchestrator must stop posting, not just drop this batch. */
  shouldStopTracking: boolean;
}

let isFlushing = false;

/**
 * Drains store/tracking-queue-store.ts oldest-first, in batches, exactly as
 * docs/DRIVER_MOBILE_GPS.md §6 specifies: "POST backlog oldest-first; ignore
 * partial rejects." Re-entrant calls no-op (matches services/offline/offline-
 * queue.ts's `isDraining` guard) — the location task, the reconnect listener,
 * and the periodic heartbeat check can all try to flush around the same
 * moment without racing each other.
 */
export async function flushTrackingQueue(): Promise<FlushOutcome> {
  if (isFlushing) return { shouldStopTracking: false };
  isFlushing = true;

  try {
    for (;;) {
      const batch = useTrackingQueueStore.getState().positions.slice(0, MAX_FLUSH_ATTEMPT_SIZE);
      if (batch.length === 0) return { shouldStopTracking: false };

      try {
        const result = await trackingAPI.postMyLocation(batch);
        // Every attempted key leaves the queue: accepted ones succeeded,
        // rejected ones failed validation (bad coords, out-of-order, future
        // timestamp) and retrying the identical payload would just fail again.
        useTrackingQueueStore.getState().removeMany(batch.map((p) => p.idempotencyKey));
        useTrackingStore.getState().recordLocationSuccess(result);
      } catch (error) {
        if (isClientError(error)) {
          // The whole batch was refused at the request level — most likely no
          // live dispatch anymore (server already ended the session; ours to
          // stop posting, not to keep retrying an ex-dispatch's positions
          // forever). Drop this batch rather than let it block the queue
          // behind a request that will never succeed.
          useTrackingQueueStore.getState().removeMany(batch.map((p) => p.idempotencyKey));
          useTrackingStore.getState().recordFailure(describeError(error, 'Location rejected'));
          return { shouldStopTracking: true };
        }
        // Network/server failure — leave the batch queued, stop this flush
        // pass, and let the next trigger (timer, reconnect, next fix) retry.
        useTrackingStore.getState().recordFailure(describeError(error, 'Failed to sync location'));
        return { shouldStopTracking: false };
      }
    }
  } finally {
    isFlushing = false;
  }
}
