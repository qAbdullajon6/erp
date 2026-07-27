import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MapApp = 'google' | 'apple' | 'waze';

interface NavigationPreferenceState {
  /** null until the driver has either picked "always use this" once, or never —
   * the picker is shown every time until they do. Not a UI preference worth
   * SecureStore's overhead; losing it just means seeing the picker once more. */
  preferredApp: MapApp | null;
  setPreferredApp: (app: MapApp | null) => void;
}

export const useNavigationPreferenceStore = create<NavigationPreferenceState>()(
  persist(
    (set) => ({
      preferredApp: null,
      setPreferredApp: (app) => set({ preferredApp: app }),
    }),
    {
      name: 'flowerp-driver-navigation-preference',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
