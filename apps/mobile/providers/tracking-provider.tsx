import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { useTrackingStore } from '@/store/tracking-store';
import { useMyDispatchesQuery } from '@/services/api/endpoints/driver';
import { startTracking, stopTracking } from '@/services/tracking/tracking-orchestrator';

/**
 * The one place that decides WHEN GPS tracking runs — mounted once in
 * app/(driver)/_layout.tsx, so it's alive for as long as a driver is signed
 * in, regardless of which tab or screen they're looking at. Everything else
 * (services/tracking/tracking-orchestrator.ts) just does what it's told.
 *
 * The lifecycle from docs/DRIVER_MOBILE_GPS.md §1, driven entirely by state
 * this app already has — no polling invented for this:
 *
 *   authenticated + has a live dispatch  → tracking should be ON
 *   not authenticated (logged out)       → tracking OFF, immediately
 *   authenticated, no live dispatch      → tracking OFF (nothing to attribute
 *                                           positions to — the server would
 *                                           404 every post anyway)
 *
 * "App restart recovery" falls out of this for free: a fresh cold start that
 * rehydrates an authenticated session and finds a live dispatch just runs
 * this effect once more and starts tracking, no special-cased "was I tracking
 * before I was killed" flag needed.
 */
export function TrackingProvider({ children }: { children: React.ReactNode }) {
  const authStatus = useAuthStore((state) => state.status);
  const lifecycleStatus = useTrackingStore((state) => state.lifecycleStatus);
  // Re-evaluated when permission is granted from Account — a driver who
  // starts a shift, gets denied, then goes and taps "Allow" shouldn't have to
  // background/foreground the app or wait for an unrelated state change to
  // get tracking retried.
  const hasForegroundPermission = useTrackingStore((state) => state.hasForegroundPermission);
  const dispatchesQuery = useMyDispatchesQuery(false, authStatus === 'authenticated');
  const hasLiveDispatch = (dispatchesQuery.data?.length ?? 0) > 0;

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      if (lifecycleStatus !== 'stopped') void stopTracking('logout');
      return;
    }

    if (!dispatchesQuery.isSuccess) return; // don't act on a guess before we know

    if (hasLiveDispatch) {
      // Deliberately excludes 'error' — retrying a failed start is owned by
      // tracking-orchestrator.ts's own backoff timer (scheduleRetry), not this
      // effect. Reacting to 'error' here too would mean a start failure that
      // rejects immediately turns into an unbounded retry loop: error state
      // change -> this effect re-fires -> startTracking -> error again, with
      // no delay in between. Confirmed live during testing.
      if (lifecycleStatus === 'stopped') void startTracking();
    } else if (lifecycleStatus === 'tracking' || lifecycleStatus === 'starting') {
      void stopTracking('dispatch-ended');
    }
  }, [authStatus, hasLiveDispatch, dispatchesQuery.isSuccess, lifecycleStatus, hasForegroundPermission]);

  return children;
}
