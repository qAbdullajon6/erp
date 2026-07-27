import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DriverActionableStatus } from '@/services/api/endpoints/driver';

/**
 * AsyncStorage, not SecureStore, on purpose here — unlike store/auth-store.ts this
 * holds no credential. A queued item is "call an endpoint I was already authorized
 * to call, with these arguments" — the same authorization check runs again
 * server-side when it's replayed, so there's nothing to protect by encrypting it
 * at rest, and SecureStore's per-item size limits (2KB on Android) are a worse fit
 * for a growing list than AsyncStorage's plain file.
 */
export type QueuedActionState = 'pending' | 'syncing' | 'conflict' | 'failed';

export interface QueuedStatusUpdate {
  id: string;
  kind: 'dispatch-status-update';
  dispatchId: string;
  dispatchNumber: string;
  status: DriverActionableStatus;
  note?: string;
  queuedAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  state: QueuedActionState;
}

interface OfflineQueueState {
  items: QueuedStatusUpdate[];
  enqueue: (item: Omit<QueuedStatusUpdate, 'attempts' | 'lastAttemptAt' | 'lastError' | 'state'>) => void;
  markSyncing: (id: string) => void;
  markSynced: (id: string) => void;
  markFailed: (id: string, error: string) => void;
  markConflict: (id: string, error: string) => void;
  remove: (id: string) => void;
  resetToPending: (id: string) => void;
}

export const useOfflineQueueStore = create<OfflineQueueState>()(
  persist(
    (set) => ({
      items: [],

      enqueue: (item) =>
        set((state) => ({
          items: [
            ...state.items,
            { ...item, attempts: 0, lastAttemptAt: null, lastError: null, state: 'pending' },
          ],
        })),

      markSyncing: (id) =>
        set((state) => ({
          items: state.items.map((item) => (item.id === id ? { ...item, state: 'syncing' } : item)),
        })),

      markSynced: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),

      markFailed: (id, error) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  state: 'failed',
                  attempts: item.attempts + 1,
                  lastAttemptAt: new Date().toISOString(),
                  lastError: error,
                }
              : item,
          ),
        })),

      // A conflict (409, or the transition is no longer legal) is NOT auto-retried
      // — the world moved on while this was queued, and resending the same action
      // would either fail again or, worse, silently succeed against a dispatch
      // that's no longer in the state the driver thought it was in. It waits for
      // the driver to look at it.
      markConflict: (id, error) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  state: 'conflict',
                  attempts: item.attempts + 1,
                  lastAttemptAt: new Date().toISOString(),
                  lastError: error,
                }
              : item,
          ),
        })),

      remove: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),

      resetToPending: (id) =>
        set((state) => ({
          items: state.items.map((item) => (item.id === id ? { ...item, state: 'pending' } : item)),
        })),
    }),
    {
      name: 'flowerp-driver-offline-queue',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
