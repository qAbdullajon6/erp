import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from './fetch';
import { sessionManager } from './session';

export { sessionManager };

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  membership: {
    id: string;
    role: string;
  };
}

export interface CurrentUser {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    /// FlowERP staff rather than a customer. Used only to decide whether to
    /// render the Leads screen — the API's PlatformAdminGuard is what actually
    /// protects the data.
    isPlatformAdmin: boolean;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  membership: {
    id: string;
    role: string;
  };
}

class AuthAPI {
  private baseUrl = '/api';

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        // The API wraps failures as { error: { statusCode, message } } — reading
        // `body.message` always came back undefined, so every failed sign-in
        // showed the same generic "Login failed" instead of the real reason.
        const body = await response.json().catch(() => ({}));
        const message = body?.error?.message ?? body?.message;
        if (response.status === 429) {
          throw new Error('Too many sign-in attempts. Please wait a minute and try again.');
        }
        throw new Error(Array.isArray(message) ? message[0] : message || 'Login failed');
      }

      const result = await response.json();
      const authData = result.data;

      // Store tokens for subsequent requests
      sessionManager.setTokens(authData.accessToken, authData.refreshToken);

      return authData;
    } catch (error) {
      console.error('Error logging in:', error);
      throw error;
    }
  }

  /// Goes through apiFetch so an expired access token is transparently
  /// refreshed. This is the request the dashboard fires on every navigation,
  /// so when it used to wipe the session on 401 it was what logged people out.
  async getCurrentUser(): Promise<CurrentUser> {
    const response = await apiFetch(`${this.baseUrl}/auth/me`, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`Failed to fetch current user: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data;
  }

  async logout(): Promise<void> {
    const refreshToken = sessionManager.getRefreshToken();
    try {
      // The API's logout DTO requires the refresh token so it can revoke it —
      // posting an empty body just 400'd and left the session live server-side.
      if (refreshToken) {
        await apiFetch(`${this.baseUrl}/auth/logout`, {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      sessionManager.clearTokens();
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const response = await apiFetch(`${this.baseUrl}/auth/change-password`, {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to change password');
    }
  }
}

export const authAPI = new AuthAPI();

export function useLogin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setLoading(true);
    setError(null);
    try {
      const result = await authAPI.login(credentials);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to login';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { login, loading, error };
}

export function useCurrentUser() {
  const [data, setData] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await authAPI.getCurrentUser();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // `loading` starts true, so a consumer that forgets to call fetch() renders
  // its skeleton forever — which is exactly what Settings → Profile did. The
  // callback has no dependencies, so this runs once per mount.
  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch, fetch };
}

export function useLogout() {
  const logout = useCallback(async () => {
    await authAPI.logout();
  }, []);

  return { logout };
}

export function useChangePassword() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    setLoading(true);
    setError(null);
    try {
      await authAPI.changePassword(currentPassword, newPassword);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to change password';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { changePassword, loading, error };
}
