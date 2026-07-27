import * as TaskManager from 'expo-task-manager';
import type { LocationObject } from 'expo-location';
import { classifyMovement } from './movement-classifier';
import { flushTrackingQueue } from './tracking-queue';
import { LOCATION_TASK_NAME } from './tracking-config';
import { useTrackingQueueStore } from '@/store/tracking-queue-store';
import { useTrackingStore } from '@/store/tracking-store';
import type { IngestPosition } from './tracking-types';
import { onMovementStateChanged, stopTracking } from './tracking-orchestrator';

/**
 * Defined at module scope, unconditionally — Expo's hard requirement for
 * background tasks (it must exist before `Location.startLocationUpdatesAsync`
 * is ever called, and it must run again on every cold start so the OS has
 * something to invoke after relaunching the app for a background update).
 * Imported once, for this side effect, at the very top of app/_layout.tsx —
 * see that file for why it has to be that early.
 *
 * This is the ONE code path that receives a GPS fix, whether the app is
 * foregrounded, backgrounded, or (Android, with the foreground service
 * running) fully swiped away. There is no separate `watchPositionAsync` path
 * for "foreground mode" — using the same background-capable API everywhere
 * means foreground and background tracking are the same code, not two
 * implementations that can drift.
 */
function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function handleLocations(locations: LocationObject[]) {
  // Oldest first — a batched background delivery can contain several fixes;
  // process (and therefore enqueue/POST) them in the order they happened.
  const ordered = [...locations].sort((a, b) => a.timestamp - b.timestamp);

  for (const location of ordered) {
    const recordedAtMs = location.timestamp;
    const movementState = classifyMovement(location.coords.speed, recordedAtMs);

    const fix = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracyM: location.coords.accuracy,
      speedKph: location.coords.speed !== null ? Math.max(0, location.coords.speed) * 3.6 : null,
      heading: location.coords.heading,
      recordedAt: new Date(recordedAtMs).toISOString(),
    };

    useTrackingStore.getState().recordFix(fix);
    useTrackingStore.getState().setMovementState(movementState);

    const position: IngestPosition = {
      latitude: fix.latitude,
      longitude: fix.longitude,
      recordedAt: fix.recordedAt,
      speedKph: fix.speedKph ?? undefined,
      heading: fix.heading ?? undefined,
      accuracyM: fix.accuracyM ?? undefined,
      idempotencyKey: generateIdempotencyKey(),
    };
    useTrackingQueueStore.getState().enqueue(position);

    // Movement state may have just flipped (moving↔stopped) — the
    // orchestrator decides whether the active watcher config needs to change
    // to match (see tracking-orchestrator.ts's battery-friendly interval
    // switch). Fire-and-forget: reconfiguring is a stop+restart of the OS
    // location engine and must not block processing this fix.
    void onMovementStateChanged(movementState);
  }

  const outcome = await flushTrackingQueue();
  if (outcome.shouldStopTracking) {
    await stopTracking('server-rejected');
  }
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    useTrackingStore.getState().recordFailure(error.message);
    return;
  }
  const { locations } = (data ?? {}) as { locations?: LocationObject[] };
  if (!locations || locations.length === 0) return;

  await handleLocations(locations);
});
