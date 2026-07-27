import { create } from 'zustand';
import type { TrackingHeartbeatResult, TrackingReceiveResult } from '@/services/tracking/tracking-types';

export type TrackingLifecycleStatus = 'stopped' | 'starting' | 'tracking' | 'error';
export type MovementState = 'unknown' | 'moving' | 'stopped';
export type GpsSignalStatus = 'offline' | 'waiting' | 'connected';

export interface LastFix {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  speedKph: number | null;
  heading: number | null;
  recordedAt: string;
}

export type LastResponse =
  | { kind: 'location'; result: TrackingReceiveResult }
  | { kind: 'heartbeat'; result: TrackingHeartbeatResult }
  | { kind: 'error'; message: string };

interface TrackingState {
  lifecycleStatus: TrackingLifecycleStatus;
  movementState: MovementState;
  hasForegroundPermission: boolean;
  hasBackgroundPermission: boolean;
  isBackgroundTaskRegistered: boolean;
  lastFix: LastFix | null;
  /** Last successful write to the server — a location POST or a heartbeat. */
  lastSyncAt: string | null;
  /** Last time the server confirmed the session is alive (either a GPS post,
   * which always refreshes it server-side, or an explicit heartbeat). */
  lastHeartbeatAt: string | null;
  sessionId: string | null;
  packetsSent: number;
  packetsFailed: number;
  lastResponse: LastResponse | null;

  setLifecycleStatus: (status: TrackingLifecycleStatus) => void;
  setMovementState: (state: MovementState) => void;
  setPermissions: (input: { foreground?: boolean; background?: boolean }) => void;
  setBackgroundTaskRegistered: (registered: boolean) => void;
  recordFix: (fix: LastFix) => void;
  recordLocationSuccess: (result: TrackingReceiveResult) => void;
  recordHeartbeatSuccess: (result: TrackingHeartbeatResult) => void;
  recordFailure: (message: string) => void;
  reset: () => void;
}

const initialState = {
  lifecycleStatus: 'stopped' as TrackingLifecycleStatus,
  movementState: 'unknown' as MovementState,
  hasForegroundPermission: false,
  hasBackgroundPermission: false,
  isBackgroundTaskRegistered: false,
  lastFix: null as LastFix | null,
  lastSyncAt: null as string | null,
  lastHeartbeatAt: null as string | null,
  sessionId: null as string | null,
  packetsSent: 0,
  packetsFailed: 0,
  lastResponse: null as LastResponse | null,
};

/**
 * Live telemetry for the UI (GPS status card, dev diagnostics) — deliberately
 * NOT persisted across app restarts. Showing a "last synced 2 hours ago" left
 * over from a previous process would be more confusing than honest; a fresh
 * process earns a fresh picture, and the real durable state (the position
 * backlog) lives in store/tracking-queue-store.ts instead.
 */
export const useTrackingStore = create<TrackingState>()((set) => ({
  ...initialState,

  setLifecycleStatus: (lifecycleStatus) => set({ lifecycleStatus }),
  setMovementState: (movementState) => set({ movementState }),
  setPermissions: ({ foreground, background }) =>
    set((state) => ({
      hasForegroundPermission: foreground ?? state.hasForegroundPermission,
      hasBackgroundPermission: background ?? state.hasBackgroundPermission,
    })),
  setBackgroundTaskRegistered: (isBackgroundTaskRegistered) => set({ isBackgroundTaskRegistered }),
  recordFix: (lastFix) => set({ lastFix }),

  recordLocationSuccess: (result) =>
    set((state) => {
      const now = new Date().toISOString();
      return {
        packetsSent: state.packetsSent + 1,
        lastSyncAt: now,
        lastHeartbeatAt: now,
        sessionId: result.sessionId ?? state.sessionId,
        lastResponse: { kind: 'location', result },
      };
    }),

  recordHeartbeatSuccess: (result) =>
    set((state) => {
      const now = new Date().toISOString();
      return {
        packetsSent: state.packetsSent + 1,
        lastSyncAt: now,
        lastHeartbeatAt: result.lastHeartbeatAt ?? now,
        sessionId: result.sessionId ?? state.sessionId,
        lastResponse: { kind: 'heartbeat', result },
      };
    }),

  recordFailure: (message) =>
    set((state) => ({
      packetsFailed: state.packetsFailed + 1,
      lastResponse: { kind: 'error', message },
    })),

  reset: () => set(initialState),
}));

const GPS_FRESHNESS_WINDOW_MS = 90_000;

/** Pure derivation, not stored redundantly — recomputed by whatever reads it
 * (the Home GPS card, dev diagnostics). "Connected" requires an actual recent
 * fix that actually reached the server, not just "tracking is turned on." */
export function computeGpsStatus(state: {
  lifecycleStatus: TrackingLifecycleStatus;
  lastFix: LastFix | null;
  lastSyncAt: string | null;
  isNetworkOnline: boolean;
}): GpsSignalStatus {
  if (state.lifecycleStatus !== 'tracking') return 'offline';
  if (!state.isNetworkOnline) return 'offline';
  if (!state.lastFix || !state.lastSyncAt) return 'waiting';

  const syncAgeMs = Date.now() - new Date(state.lastSyncAt).getTime();
  return syncAgeMs <= GPS_FRESHNESS_WINDOW_MS ? 'connected' : 'waiting';
}
