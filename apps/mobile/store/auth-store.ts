import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '@/lib/storage/secure-storage';
import type { AuthMembership, AuthOrganization, AuthUser } from '@/types/api';

export type SessionStatus =
  /** Store constructed, `persist` hasn't finished reading SecureStore yet. The
   * router must not make an auth decision in this state — see app/_layout.tsx. */
  | 'restoring'
  | 'authenticated'
  | 'unauthenticated';

interface AuthState {
  status: SessionStatus;
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  organization: AuthOrganization | null;
  membership: AuthMembership | null;

  setSession: (session: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
    organization: AuthOrganization;
    membership: AuthMembership;
  }) => void;
  /** apiFetch calls this after a successful 401-triggered refresh — same tokens
   * shape, no user/org/membership round trip needed since those didn't change. */
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearSession: () => void;
}

/**
 * The one source of truth for "is anyone signed in, and as whom." Tokens persist to
 * SecureStore (Keychain/Keystore-backed, never AsyncStorage — see
 * lib/storage/secure-storage.ts) via zustand's own `persist` middleware, so session
 * restoration on cold start is "wait for hydration," not a hand-rolled bootstrap
 * effect: `useAuthStore.persist.onFinishHydration` / `.hasHydrated()` is what
 * app/_layout.tsx waits on before it lets Expo Router decide which stack to mount.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      status: 'restoring',
      accessToken: null,
      refreshToken: null,
      user: null,
      organization: null,
      membership: null,

      setSession: ({ accessToken, refreshToken, user, organization, membership }) =>
        set({
          status: 'authenticated',
          accessToken,
          refreshToken,
          user,
          organization,
          membership,
        }),

      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),

      clearSession: () =>
        set({
          status: 'unauthenticated',
          accessToken: null,
          refreshToken: null,
          user: null,
          organization: null,
          membership: null,
        }),
    }),
    {
      name: 'flowerp-driver-session',
      storage: createJSONStorage(() => secureStorage),
      // Only the credential and the identity needed to render the app shell before
      // the first /auth/me refetch resolves. `status` is excluded on purpose: it is
      // re-derived below, once, from whether a token actually came back.
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        organization: state.organization,
        membership: state.membership,
      }),
      onRehydrateStorage: () => (restored) => {
        useAuthStore.setState({
          status: restored?.accessToken && restored?.refreshToken ? 'authenticated' : 'unauthenticated',
        });
      },
    },
  ),
);

export const authStore = {
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
};
