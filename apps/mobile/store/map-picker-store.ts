import { create } from 'zustand';

export interface MapDestination {
  address: string;
  city: string;
}

interface MapPickerState {
  destination: MapDestination | null;
  open: (destination: MapDestination) => void;
  close: () => void;
}

/** Holds only "what destination is the picker sheet open for" — the sheet itself
 * (features/jobs/components/map-app-picker-sheet.tsx) is mounted once, globally,
 * and watches this store to present/dismiss, so any screen can trigger it with a
 * plain function call instead of needing its own BottomSheetModal + ref. */
export const useMapPickerStore = create<MapPickerState>()((set) => ({
  destination: null,
  open: (destination) => set({ destination }),
  close: () => set({ destination: null }),
}));
