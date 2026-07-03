"use client";

import * as React from "react";
import { apiClient, type AuthResult } from "./api-client";

/// A signed-in session for Connected Mode only — entirely separate from the
/// demo's localStorage data (different key, never read/written by the demo
/// store in src/lib/store.tsx) and from the demo role switcher (src/lib/role.tsx).
export interface ApiSession {
  accessToken: string;
  refreshToken: string;
  user: AuthResult["user"];
  organization: AuthResult["organization"];
  membership: AuthResult["membership"];
}

const STORAGE_KEY = "flowerp:api-session:v1";

type Status = "idle" | "loading" | "error";
type Listener = () => void;

class ApiSessionStore {
  private session: ApiSession | null = null;
  private status: Status = "idle";
  private errorMessage: string | null = null;
  private listeners = new Set<Listener>();
  private hydrated = false;

  getSessionSnapshot = (): ApiSession | null => this.session;
  getSessionServerSnapshot = (): ApiSession | null => null;
  getStatusSnapshot = (): Status => this.status;
  getErrorSnapshot = (): string | null => this.errorMessage;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  hydrate = () => {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.session = JSON.parse(raw) as ApiSession;
        this.notify();
      }
    } catch {
      // ignore malformed storage
    }
  };

  private persist(session: ApiSession | null) {
    this.session = session;
    try {
      if (session) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore storage write failures
    }
    this.notify();
  }

  login = async (email: string, password: string, organizationSlug?: string): Promise<void> => {
    this.status = "loading";
    this.errorMessage = null;
    this.notify();

    try {
      const result = await apiClient.login({ email, password, organizationSlug });
      this.persist({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
        organization: result.organization,
        membership: result.membership,
      });
      this.status = "idle";
      this.notify();
    } catch (error) {
      this.status = "error";
      this.errorMessage = error instanceof Error ? error.message : "Sign-in failed";
      this.notify();
      throw error;
    }
  };

  logout = (): void => {
    this.status = "idle";
    this.errorMessage = null;
    this.persist(null);
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

  return { session, status, errorMessage, login: store.login, logout: store.logout };
}
