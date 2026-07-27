import { Accuracy } from 'expo-location';

/** The background/foreground TaskManager task name — must be a stable string,
 * referenced by both the task definition (location-task.ts) and every start/
 * stop call, and must match across app restarts since Android/iOS persist the
 * registration by name. */
export const LOCATION_TASK_NAME = 'flowerp-driver-location-task';

/**
 * Cadence targets, straight from the Phase 3 spec and cross-checked against
 * docs/DRIVER_MOBILE_GPS.md §4 (which allows a slightly wider 5–15s moving
 * window — these values sit inside both):
 *
 *   Moving   5–10s  → 7s
 *   Stopped  30–60s → 45s
 *   Heartbeat        30s (safety net only — see tracking-heartbeat.ts)
 */
export const MOVING_INTERVAL_MS = 7_000;
export const STOPPED_INTERVAL_MS = 45_000;
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** Distance filters paired with each cadence — "or on meaningful move" per the
 * ingest contract doc. Moving stays fine-grained; stopped only reports if the
 * vehicle actually displaced, not merely GPS jitter. */
export const MOVING_DISTANCE_INTERVAL_M = 15;
export const STOPPED_DISTANCE_INTERVAL_M = 50;

/** Speed classification threshold — ~5 km/h, comfortably above GPS jitter for
 * a stationary vehicle but well below any real driving speed. */
export const MOVING_SPEED_THRESHOLD_MPS = 1.4;

/** How long speed must stay under threshold before we reclassify as stopped —
 * hysteresis so a red light doesn't flip the watcher config every few
 * seconds (each flip stops and restarts the OS location engine). */
export const STOPPED_CONFIRM_MS = 60_000;

/** Battery-friendly accuracy split — the literal Phase 3 requirement: "Only
 * request high accuracy while moving. Use lower power while stopped." */
export const MOVING_ACCURACY = Accuracy.High;
export const STOPPED_ACCURACY = Accuracy.Low;

/** Batch ceiling matches the server's own limit (ingest-positions.dto.ts:
 * `@ArrayMaxSize(1000)`) — never send more than this in one request. */
export const MAX_BATCH_SIZE = 1000;

/** A request that never gets flushed within this long is presumed to have
 * accumulated stale queue debt; queue draining keeps going regardless, this
 * just bounds how much we attempt per flush call to stay responsive. */
export const MAX_FLUSH_ATTEMPT_SIZE = 200;

/** `Location.startLocationUpdatesAsync` registering the OS location engine
 * should resolve in well under a second on a real device — this is a safety
 * ceiling, not an expected wait. Without it, a platform/OS edge case where
 * the promise never settles (confirmed live on the web preview target: it
 * hangs indefinitely rather than rejecting) would leave the driver looking at
 * "Starting…" forever with no explanation and no way to retry. */
export const START_TIMEOUT_MS = 15_000;

/** Backoff before automatically retrying `startTracking()` after it fails —
 * whether the failure took the full START_TIMEOUT_MS or (as with an
 * immediately-rejecting native call) a few milliseconds. Retrying is owned
 * entirely by the orchestrator's own timer, not by a reactive effect keyed on
 * `lifecycleStatus`, specifically so a fast/synchronous failure can't retrigger
 * a retry-render-retry cycle with no delay between attempts. */
export const RETRY_BACKOFF_MS = 30_000;
