"use client";

import * as React from "react";
import { apiClient, ApiRequestError, type AuthResult, type RegisterInput } from "./api-client";

/// A signed-in Connected Mode identity — entirely separate from the demo's
/// localStorage data (different key, never read/written by the demo store
/// in src/lib/store.tsx) and from the demo role switcher (src/lib/role.tsx).
/// Deliberately holds NO tokens — see the storage note below.
export interface ApiSession {
  user: AuthResult["user"];
  organization: AuthResult["organization"];
  membership: AuthResult["membership"];
}

const STORAGE_KEY = "flowerp:api-session:v1";

/// What actually gets written to localStorage, and only when the user
/// checked "remember me" at sign-in. The access token is NEVER persisted
/// here (or anywhere) — it only ever lives in the ApiSessionStore instance
/// field below, i.e. React/JS memory that's gone the moment the tab/process
/// is closed or the page is hard-reloaded. This is a documented
/// local-development tradeoff, not a production security posture — see
/// docs/CONNECTED_MODE_AUTH_UI.md for why true httpOnly-cookie refresh
/// storage isn't implemented in this phase.
interface PersistedSession {
  refreshToken: string;
  user: AuthResult["user"];
  organization: AuthResult["organization"];
  membership: AuthResult["membership"];
}

type Status = "idle" | "loading" | "error";
type Listener = () => void;

class ApiSessionStore {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private rememberMe = false;
  private session: ApiSession | null = null;
  private status: Status = "idle";
  private errorMessage: string | null = null;
  /// True from first use until the silent refresh-on-load attempt (see
  /// hydrate()) resolves — distinct from `status`, which is only for
  /// explicit login/register form submissions.
  private initializing = true;
  private listeners = new Set<Listener>();
  private hydrateStarted = false;

  getSessionSnapshot = (): ApiSession | null => this.session;
  getSessionServerSnapshot = (): ApiSession | null => null;
  getStatusSnapshot = (): Status => this.status;
  getErrorSnapshot = (): string | null => this.errorMessage;
  getInitializingSnapshot = (): boolean => this.initializing;
  getInitializingServerSnapshot = (): boolean => true;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  /// Attempts a one-time silent refresh from a previously "remembered"
  /// session on first use (e.g. app load / hard reload). If nothing was
  /// persisted, or the persisted refresh token turns out to be expired or
  /// revoked, this just resolves to signed-out — never throws, never blocks
  /// rendering beyond the `initializing` flag.
  hydrate = () => {
    if (this.hydrateStarted) return;
    this.hydrateStarted = true;

    let persisted: PersistedSession | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) persisted = JSON.parse(raw) as PersistedSession;
    } catch {
      persisted = null;
    }

    if (!persisted) {
      this.initializing = false;
      this.notify();
      return;
    }

    this.rememberMe = true;
    apiClient.refresh(persisted.refreshToken).then(
      (result) => {
        this.applySession(result);
        this.initializing = false;
        this.notify();
      },
      () => {
        this.clearAll();
        this.initializing = false;
        this.notify();
      },
    );
  };

  private persistOrClear() {
    try {
      if (this.rememberMe && this.refreshToken && this.session) {
        const toPersist: PersistedSession = {
          refreshToken: this.refreshToken,
          user: this.session.user,
          organization: this.session.organization,
          membership: this.session.membership,
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore storage write failures — the in-memory session still works
      // for the rest of this tab's lifetime
    }
  }

  private applySession(result: AuthResult) {
    this.accessToken = result.accessToken;
    this.refreshToken = result.refreshToken;
    this.session = { user: result.user, organization: result.organization, membership: result.membership };
    this.persistOrClear();
  }

  private clearAll() {
    this.accessToken = null;
    this.refreshToken = null;
    this.rememberMe = false;
    this.session = null;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  login = async (
    email: string,
    password: string,
    organizationSlug: string | undefined,
    rememberMe: boolean,
  ): Promise<void> => {
    this.status = "loading";
    this.errorMessage = null;
    this.notify();

    try {
      const result = await apiClient.login({ email, password, organizationSlug });
      this.rememberMe = rememberMe;
      this.applySession(result);
      this.status = "idle";
      this.notify();
    } catch (error) {
      this.status = "error";
      this.errorMessage = error instanceof Error ? error.message : "Sign-in failed";
      this.notify();
      throw error;
    }
  };

  register = async (input: RegisterInput, rememberMe: boolean): Promise<void> => {
    this.status = "loading";
    this.errorMessage = null;
    this.notify();

    try {
      const result = await apiClient.register(input);
      this.rememberMe = rememberMe;
      this.applySession(result);
      this.status = "idle";
      this.notify();
    } catch (error) {
      this.status = "error";
      this.errorMessage = error instanceof Error ? error.message : "Registration failed";
      this.notify();
      throw error;
    }
  };

  logout = (): void => {
    const token = this.accessToken;
    const refresh = this.refreshToken;
    this.status = "idle";
    this.errorMessage = null;
    this.clearAll();
    this.notify();
    if (token && refresh) {
      apiClient.logout(token, refresh).catch(() => {
        // best-effort revoke — the session is already cleared locally
      });
    }
  };

  logoutAll = (): void => {
    const token = this.accessToken;
    this.status = "idle";
    this.errorMessage = null;
    this.clearAll();
    this.notify();
    if (token) {
      apiClient.logoutAll(token).catch(() => {
        // best-effort revoke — the session is already cleared locally
      });
    }
  };

  /// The one place any Connected Mode UI should call the authenticated API:
  /// runs `fn` with the current in-memory access token, and if it fails
  /// with a 401 (expired/invalid access token, not a permissions issue),
  /// attempts exactly one silent refresh-and-retry before giving up. If the
  /// refresh itself fails, the session is cleared and the ORIGINAL 401 is
  /// rethrown so callers can show a "session expired, sign in again" state.
  callApi = async <T,>(fn: (accessToken: string) => Promise<T>): Promise<T> => {
    if (!this.accessToken) {
      throw new ApiRequestError(401, "Not signed in");
    }

    try {
      return await fn(this.accessToken);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401 && this.refreshToken) {
        try {
          const result = await apiClient.refresh(this.refreshToken);
          this.applySession(result);
          this.notify();
          return await fn(this.accessToken);
        } catch {
          this.clearAll();
          this.notify();
          throw error;
        }
      }
      throw error;
    }
  };
}

const store = new ApiSessionStore();

/// No provider component on purpose — Connected Mode is opt-in per module,
/// so hydration happens lazily the first time this hook is used, rather
/// than wiring a global provider into (app)/layout.tsx for a feature most
/// deployments never enable.
export function useApiSession() {
  React.useEffect(() => {
    store.hydrate();
  }, []);

  const session = React.useSyncExternalStore(
    store.subscribe,
    store.getSessionSnapshot,
    store.getSessionServerSnapshot,
  );
  const status = React.useSyncExternalStore(
    store.subscribe,
    store.getStatusSnapshot,
    store.getStatusSnapshot,
  );
  const errorMessage = React.useSyncExternalStore(
    store.subscribe,
    store.getErrorSnapshot,
    store.getErrorSnapshot,
  );
  const initializing = React.useSyncExternalStore(
    store.subscribe,
    store.getInitializingSnapshot,
    store.getInitializingServerSnapshot,
  );

  return {
    session,
    status,
    errorMessage,
    initializing,
    login: store.login,
    register: store.register,
    logout: store.logout,
    logoutAll: store.logoutAll,
    callApi: store.callApi,
  };
}
