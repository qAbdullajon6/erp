import * as Location from 'expo-location';
import type { LocationTaskOptions } from 'expo-location';
import { flushTrackingQueue } from './tracking-queue';
import { trackingAPI } from './tracking-api';
import { isClientError } from '@/services/api/error';
import { describeError } from '@/services/api/describe-error';
import { resetMovementClassifier } from './movement-classifier';
import { useTrackingStore, type MovementState } from '@/store/tracking-store';
import {
  LOCATION_TASK_NAME,
  MOVING_ACCURACY,
  MOVING_DISTANCE_INTERVAL_M,
  MOVING_INTERVAL_MS,
  STOPPED_ACCURACY,
  STOPPED_DISTANCE_INTERVAL_M,
  STOPPED_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS,
  START_TIMEOUT_MS,
  RETRY_BACKOFF_MS,
} from './tracking-config';

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

type WatcherProfile = 'moving' | 'stopped';

/** Which profile the OS location engine is currently configured for — module-
 * level because there is exactly one tracking session per process, same
 * reasoning as movement-classifier.ts's singleton state. `null` means no
 * watcher is registered at all. */
let activeProfile: WatcherProfile | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function cancelRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

/** Retrying after a failed start is owned here, on a fixed backoff — NOT by a
 * reactive effect keyed on `lifecycleStatus === 'error'`. A failure that
 * rejects immediately (e.g. the OS location engine refusing outright) would
 * otherwise round-trip through error -> effect re-fires -> startTracking ->
 * error again with no delay in between, spinning as fast as the JS event loop
 * allows. This showed up live during testing: tens of thousands of retries in
 * under a second. RETRY_BACKOFF_MS forces real spacing between attempts
 * regardless of how fast the underlying failure is. */
function scheduleRetry() {
  cancelRetry();
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (useTrackingStore.getState().lifecycleStatus === 'error') {
      void startTracking();
    }
  }, RETRY_BACKOFF_MS);
}

function buildOptions(profile: WatcherProfile): LocationTaskOptions {
  const isMoving = profile === 'moving';
  return {
    accuracy: isMoving ? MOVING_ACCURACY : STOPPED_ACCURACY,
    timeInterval: isMoving ? MOVING_INTERVAL_MS : STOPPED_INTERVAL_MS,
    distanceInterval: isMoving ? MOVING_DISTANCE_INTERVAL_M : STOPPED_DISTANCE_INTERVAL_M,
    // Android 8+ requires a foreground service (and its notification) for
    // location updates to keep flowing once the app is backgrounded — this
    // is what makes background tracking real instead of "works until the
    // screen locks." Harmless no-op on iOS.
    foregroundService: {
      notificationTitle: 'FlowERP Driver',
      notificationBody: isMoving ? 'Sharing your location while on a delivery' : 'Tracking paused — vehicle stopped',
      notificationColor: '#319cfc',
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
  };
}

async function registerWatcher(profile: WatcherProfile) {
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, buildOptions(profile));
  activeProfile = profile;
}

async function unregisterWatcher() {
  const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => undefined);
  }
  activeProfile = null;
}

/** Called from the location task after classifying a fix (movement-classifier.ts).
 * A flip in movement state means the battery-friendly config needs to change —
 * this is the whole of "adaptive interval": stop the OS location engine and
 * restart it with the profile that matches reality. Only acts when tracking
 * is actually active and the state genuinely changed. */
export async function onMovementStateChanged(state: MovementState) {
  if (state === 'unknown') return;
  if (useTrackingStore.getState().lifecycleStatus !== 'tracking') return;
  if (activeProfile === state) return;

  try {
    await withTimeout(registerWatcher(state), START_TIMEOUT_MS, 'Timed out reconfiguring GPS tracking');
  } catch {
    // Reconfiguration failing (or hanging past the timeout) leaves the
    // previous profile running — tracking continues at the old cadence
    // rather than stopping outright.
  }
}

function startHeartbeatTimer() {
  stopHeartbeatTimer();
  heartbeatTimer = setInterval(() => {
    void sendHeartbeatIfNeeded();
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeatTimer() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/** The heartbeat is a safety net, not a routine packet — every successful GPS
 * post already refreshes the session's `lastHeartbeatAt` server-side
 * (apps/api's `touchSessionAfterGps`), so a fix-flowing driver never sends
 * one. It only fires when nothing has kept the session fresh in the last
 * HEARTBEAT_INTERVAL_MS — GPS cold, indoors, between fixes while stopped —
 * exactly the case docs/DRIVER_MOBILE_GPS.md §2 describes it for. It also
 * can't be the FIRST packet of a session (`heartbeatForDriver` 404s "send GPS
 * first" — apps/api's tracking.service.ts), so it no-ops until a session
 * exists. */
async function sendHeartbeatIfNeeded() {
  const state = useTrackingStore.getState();
  if (state.lifecycleStatus !== 'tracking') return;
  if (!state.sessionId) return;

  const lastBeat = state.lastHeartbeatAt ? new Date(state.lastHeartbeatAt).getTime() : 0;
  if (Date.now() - lastBeat < HEARTBEAT_INTERVAL_MS) return;

  try {
    const result = await trackingAPI.postMyHeartbeat();
    useTrackingStore.getState().recordHeartbeatSuccess(result);
  } catch (error) {
    // A 404 (no session — a GPS post will recreate one) or 400 (storm — a
    // GPS post landed a moment ago and already refreshed it) are both
    // harmless races, not failures worth counting.
    if (isClientError(error)) return;
    useTrackingStore.getState().recordFailure(describeError(error, 'Heartbeat failed'));
  }
}

export type TrackingStartResult = 'started' | 'permission-denied' | 'already-tracking';

/** The one entry point that turns tracking on. Requests FOREGROUND permission
 * if not already granted (core functionality for an on-shift driver — a
 * reasonable automatic ask); background permission is never auto-requested
 * here, it stays an explicit ask from Account (see features/account) since
 * platform guidelines expect "always" location to be a deliberate, separate
 * step, not bundled into login. */
export async function startTracking(): Promise<TrackingStartResult> {
  const store = useTrackingStore.getState();
  if (store.lifecycleStatus === 'tracking' || store.lifecycleStatus === 'starting') {
    return 'already-tracking';
  }

  cancelRetry();
  useTrackingStore.getState().setLifecycleStatus('starting');

  let foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== Location.PermissionStatus.GRANTED) {
    foreground = await Location.requestForegroundPermissionsAsync();
  }
  const background = await Location.getBackgroundPermissionsAsync();
  useTrackingStore.getState().setPermissions({
    foreground: foreground.status === Location.PermissionStatus.GRANTED,
    background: background.status === Location.PermissionStatus.GRANTED,
  });

  if (foreground.status !== Location.PermissionStatus.GRANTED) {
    useTrackingStore.getState().setLifecycleStatus('stopped');
    return 'permission-denied';
  }

  resetMovementClassifier();
  try {
    // Start on the moving profile — the safer initial assumption. A driver
    // who has just been assigned a dispatch is about to drive, and the
    // classifier downgrades to the stopped profile on its own once sustained
    // low speed confirms it (movement-classifier.ts). Bounded by
    // START_TIMEOUT_MS — see that constant for why this can't be an
    // unbounded await.
    await withTimeout(registerWatcher('moving'), START_TIMEOUT_MS, 'Timed out starting GPS tracking');
  } catch (error) {
    useTrackingStore.getState().setLifecycleStatus('error');
    useTrackingStore.getState().recordFailure(error instanceof Error ? error.message : 'Failed to start GPS');
    scheduleRetry();
    return 'permission-denied';
  }

  cancelRetry();
  useTrackingStore.getState().setBackgroundTaskRegistered(true);
  useTrackingStore.getState().setLifecycleStatus('tracking');
  startHeartbeatTimer();

  // App-restart / reconnect recovery: whatever the queue was already holding
  // (a previous process's unset fixes, or a backlog that accumulated while
  // offline) gets a flush attempt right away instead of waiting for the next
  // fix to arrive.
  void flushTrackingQueue();

  return 'started';
}

export type StopReason = 'logout' | 'dispatch-ended' | 'server-rejected' | 'manual' | 'app-start';

/** Stops everything: unregisters the OS location engine (ending the foreground
 * service notification on Android), stops the heartbeat timer, and resets the
 * movement classifier so the next start begins from a clean "unknown" state.
 * Idempotent — safe to call when nothing is running. */
export async function stopTracking(_reason: StopReason): Promise<void> {
  cancelRetry();
  stopHeartbeatTimer();
  await unregisterWatcher();
  resetMovementClassifier();
  useTrackingStore.getState().setLifecycleStatus('stopped');
  useTrackingStore.getState().setMovementState('unknown');
  useTrackingStore.getState().setBackgroundTaskRegistered(false);
}
