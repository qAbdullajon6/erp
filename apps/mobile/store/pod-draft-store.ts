import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PodDraftPhoto {
  id: string;
  /** A permanent, app-owned file:// path (services/pod/pod-capture.ts copies the
   * picker's cache-directory file into Paths.document before this is ever
   * recorded) — not the URI ImagePicker/ImageManipulator handed back, which the
   * OS is free to garbage-collect. */
  uri: string;
  width: number;
  height: number;
  fileSizeBytes: number | null;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
}

interface PodDraftState {
  /** Keyed by dispatch id — a driver can be mid-capture on one job while another
   * sits queued from earlier, and the two must never mix. */
  photosByDispatch: Record<string, PodDraftPhoto[]>;
  addPhoto: (dispatchId: string, photo: PodDraftPhoto) => void;
  removePhoto: (dispatchId: string, photoId: string) => void;
}

/**
 * There is no `POST /dispatches/:id/proofs` endpoint anywhere in apps/api (see the
 * mobile foundation report's finding on apps/web's dead delivery-proofs client) —
 * so a captured photo has nowhere to go yet. Rather than discard it or pretend it
 * uploaded, it's kept here, locally, exactly like a real "local drafts" folder,
 * ready to hand to a real upload call the day that endpoint exists.
 */
export const usePodDraftStore = create<PodDraftState>()(
  persist(
    (set) => ({
      photosByDispatch: {},

      addPhoto: (dispatchId, photo) =>
        set((state) => ({
          photosByDispatch: {
            ...state.photosByDispatch,
            [dispatchId]: [...(state.photosByDispatch[dispatchId] ?? []), photo],
          },
        })),

      removePhoto: (dispatchId, photoId) =>
        set((state) => ({
          photosByDispatch: {
            ...state.photosByDispatch,
            [dispatchId]: (state.photosByDispatch[dispatchId] ?? []).filter((photo) => photo.id !== photoId),
          },
        })),
    }),
    {
      name: 'flowerp-driver-pod-drafts',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
