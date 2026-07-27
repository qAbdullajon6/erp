import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { ApiError, unwrapResponse } from '../error';
import { authKeys } from '../query-keys';
import { useAuthStore } from '@/store/auth-store';
import type { AuthResult, CurrentUserResult } from '@/types/api';

export interface LoginInput {
  email: string;
  password: string;
  organizationSlug?: string;
}

class AuthAPI {
  async login(input: LoginInput): Promise<AuthResult> {
    const response = await apiFetch('/auth/login', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify(input),
    });
    return unwrapResponse<AuthResult>(response, 'Sign-in failed');
  }

  async me(): Promise<CurrentUserResult> {
    const response = await apiFetch('/auth/me', { method: 'GET' });
    return unwrapResponse<CurrentUserResult>(response, 'Failed to load your profile');
  }

  /** Best-effort: revokes the refresh token server-side so it can't be replayed.
   * The local session is always cleared regardless of whether this succeeds — a
   * driver who taps "Sign out" with no signal expects to be signed out. */
  async logout(refreshToken: string): Promise<void> {
    await apiFetch('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
}

export const authAPI = new AuthAPI();

/** Phase 1 is the Driver application only (see the mobile audit report). The
 * backend has no notion of "this account may only use the driver app" — any
 * membership role can authenticate — so that restriction is enforced here, at
 * the one place a session is created, rather than left to whichever screen
 * happens to render next and guess. */
export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const result = await authAPI.login(input);
      if (result.membership.role !== 'DRIVER') {
        // The freshly issued refresh token is never stored (setSession below is
        // never reached) and simply expires on its own after
        // refreshTokenExpiresInDays — revoking it here would need an
        // authenticated logout call, and the store has no access token yet to
        // authenticate it with, so that's not worth the extra request.
        throw new ApiError(
          'This app is for drivers. Sign in to the FlowERP web app with a driver account, or use the web app for other roles.',
          403,
        );
      }
      return result;
    },
    onSuccess: (result) => {
      useAuthStore.getState().setSession(result);
      queryClient.invalidateQueries({ queryKey: authKeys.me });
    },
  });
}

export function useCurrentUserQuery(enabled = true) {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: () => authAPI.me(),
    enabled,
    retry: false,
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const refreshToken = useAuthStore.getState().refreshToken;
      if (refreshToken) {
        await authAPI.logout(refreshToken);
      }
    },
    onSettled: () => {
      useAuthStore.getState().clearSession();
      queryClient.clear();
    },
  });
}
