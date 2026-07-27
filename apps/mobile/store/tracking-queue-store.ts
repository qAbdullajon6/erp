import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { IngestPosition } from '@/services/tracking/tracking-types';

/**
 * The durable GPS backlog. Every captured fix is written here FIRST, then a
 * flush is attempted immediately — there is no separate "try live, fall back
 * to queue on failure" path, so a fix is never at risk of being dropped
 * between capture and persistence, and app-restart recovery is just normal
 * zustand `persist` rehydration (no bespoke "resume" code needed: the queue
 * is already on disk, and providers/tracking-provider.tsx flushes it as soon
 * as tracking starts again).
 *
 * AsyncStorage, not SecureStore, for the same reason as
 * store/offline-queue-store.ts: this is already-authorized data (the server
 * re-checks the driver's own session on every write), not a credential.
 */
interface TrackingQueueState {
  positions: IngestPosition[];
  enqueue: (position: IngestPosition) => void;
  /** Removes by idempotencyKey — used after a flush accepts or permanently
   * rejects (validation failure) a fix; never used for transport failures,
   * which must stay queued for the next retry. */
  removeMany: (idempotencyKeys: string[]) => void;
  clear: () => void;
}

export const useTrackingQueueStore = create<TrackingQueueState>()(
  persist(
    (set) => ({
      positions: [],

      enqueue: (position) =>
        set((state) => {
          // Duplicate protection at the source: a TaskManager redelivery or a
          // foreground/background overlap during a transition should never
          // double-queue the identical fix.
          if (state.positions.some((p) => p.recordedAt === position.recordedAt)) {
            return state;
          }
          return { positions: [...state.positions, position] };
        }),

      removeMany: (idempotencyKeys) =>
        set((state) => ({
          positions: state.positions.filter((p) => !idempotencyKeys.includes(p.idempotencyKey)),
        })),

      clear: () => set({ positions: [] }),
    }),
    {
      name: 'flowerp-driver-tracking-queue',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
