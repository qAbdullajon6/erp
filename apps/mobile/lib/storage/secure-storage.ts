import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { StateStorage } from 'zustand/middleware';

/**
 * SecureStore, not AsyncStorage, for anything auth-related: SecureStore is backed by
 * the iOS Keychain / Android Keystore, so a refresh token at rest is encrypted by the
 * OS. AsyncStorage is a plain unencrypted file — fine for UI preferences, wrong for a
 * credential that grants a new access token on presentation.
 *
 * Wrapped as zustand's `StateStorage` shape so `store/auth-store.ts` can hand it
 * straight to the `persist` middleware instead of hand-rolling save/restore effects.
 *
 * The `Platform.OS === 'web'` branch below is NOT part of the app's real target
 * platforms — this is a Driver app for iOS/Android (see the mobile foundation
 * report), and expo-secure-store has no web implementation at all (confirmed live:
 * `ExpoSecureStore.default.setValueWithKeyAsync is not a function` — it's a native
 * module with nothing to back it in a browser). `localStorage` here exists solely so
 * this project can be clicked through in a browser for verification in environments
 * without an iOS/Android simulator; it carries none of SecureStore's guarantees and
 * must never be treated as the production behavior.
 */
export const secureStorage: StateStorage = {
  getItem: async (name: string) => {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(name) ?? null;
    return (await SecureStore.getItemAsync(name)) ?? null;
  },
  setItem: async (name: string, value: string) => {
    if (Platform.OS === 'web') return globalThis.localStorage?.setItem(name, value);
    await SecureStore.setItemAsync(name, value);
  },
  removeItem: async (name: string) => {
    if (Platform.OS === 'web') return globalThis.localStorage?.removeItem(name);
    await SecureStore.deleteItemAsync(name);
  },
};
