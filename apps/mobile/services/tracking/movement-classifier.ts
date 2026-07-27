import { MOVING_SPEED_THRESHOLD_MPS, STOPPED_CONFIRM_MS } from './tracking-config';
import type { MovementState } from '@/store/tracking-store';

/**
 * One classifier per process — there is only ever one active tracking session
 * per phone, so a module-level singleton (matching services/offline/offline-
 * queue.ts's `isDraining` flag pattern) is simpler and just as correct as
 * threading this through every caller.
 *
 * Hysteresis, not a raw speed check, decides "stopped": a single low-speed
 * sample at a red light must NOT flip the watcher into low-power mode mid-
 * block — only sustained low speed for STOPPED_CONFIRM_MS does.
 */
let stoppedSince: number | null = null;
let current: MovementState = 'unknown';

export function classifyMovement(speedMps: number | null, atMs: number): MovementState {
  const isSlow = speedMps === null || speedMps < MOVING_SPEED_THRESHOLD_MPS;

  if (!isSlow) {
    stoppedSince = null;
    current = 'moving';
    return current;
  }

  if (stoppedSince === null) {
    stoppedSince = atMs;
    // Don't downgrade immediately on the first slow sample — stay in whatever
    // state we were already in until the confirmation window elapses.
    if (current === 'unknown') current = 'moving';
    return current;
  }

  if (atMs - stoppedSince >= STOPPED_CONFIRM_MS) {
    current = 'stopped';
  }
  return current;
}

export function resetMovementClassifier() {
  stoppedSince = null;
  current = 'unknown';
}
