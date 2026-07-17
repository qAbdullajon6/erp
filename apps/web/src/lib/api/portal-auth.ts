import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portalFetch } from './portal-fetch';
import { portalSessionManager } from './portal-session';
import { portalAuthKeys } from './portal-query-keys';
import { unwrapResponse } from './error';
import { describeError } from './describe-error';

export { portalSessionManager };

export interface PortalLoginCredentials {
  email: string;
  password: string;
  organizationSlug?: string;
}

export interface PortalAuthResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  customer: {
    id: string;
    companyName: string;
    contactName: string | null;
    email: string;
  };
}

export interface PortalCurrentCustomer {
  customer: {
    accountId: string;
    id: string;
    companyName: string;
    contactName: string | null;
    email: string;
  };
}

class PortalAuthAPI {
  private baseUrl = '/api/customer-portal';

  async login(credentials: PortalLoginCredentials): Promise<PortalAuthResponse> {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    // unwrapResponse throws an ApiError carrying the real HTTP status, so
    // describeError (called by every screen that surfaces this) can tell a
    // business refusal ("Invalid email or password", a 4xx the server wrote
    // for the customer to read) apart from a server/network failure whose
    // raw text is never meant for an end user. The previous version threw a
    // plain Error built from the response body regardless of status, which is
    // how a bare "Cannot POST /customer-portal/auth/login" once ended up
    // rendered directly in the login form.
    const authData = await unwrapResponse<PortalAuthResponse>(response, 'Login failed');
    portalSessionManager.setTokens(authData.accessToken, authData.refreshToken);
    return authData;
  }

  async getCurrentCustomer(): Promise<PortalCurrentCustomer> {
    const response = await portalFetch(`${this.baseUrl}/auth/me`, { method: 'GET' });
    return unwrapResponse<PortalCurrentCustomer>(response, 'Failed to fetch current customer');
  }

  async logout(): Promise<void> {
    const refreshToken = portalSessionManager.getRefreshToken();
    try {
      if (refreshToken) {
        await portalFetch(`${this.baseUrl}/auth/logout`, {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
      }
    } finally {
      // Always clear local tokens, even if the server call failed (a network
      // blip must not leave the customer stuck "logged in" on their own device).
      portalSessionManager.clearTokens();
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const response = await portalFetch(`${this.baseUrl}/auth/change-password`, {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    await unwrapResponse<void>(response, 'Failed to change password');
  }
}

export const portalAuthAPI = new PortalAuthAPI();

export function usePortalLogin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (credentials: PortalLoginCredentials) => {
    setLoading(true);
    setError(null);
    try {
      return await portalAuthAPI.login(credentials);
    } catch (err) {
      setError(describeError(err, 'Failed to login'));
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { login, loading, error };
}

export function usePortalCurrentCustomer() {
  const query = useQuery({
    queryKey: portalAuthKeys.currentCustomer(),
    queryFn: () => portalAuthAPI.getCurrentCustomer(),
    staleTime: 60_000,
  });

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error ? describeError(query.error, 'Failed to load your account') : null,
    refetch: query.refetch,
  };
}

export function usePortalLogout() {
  const queryClient = useQueryClient();

  const logout = useCallback(async () => {
    await portalAuthAPI.logout();
    queryClient.clear();
  }, [queryClient]);

  return { logout };
}

export function usePortalChangePassword() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    setLoading(true);
    setError(null);
    try {
      await portalAuthAPI.changePassword(currentPassword, newPassword);
    } catch (err) {
      setError(describeError(err, 'Failed to change password'));
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { changePassword, loading, error };
}
