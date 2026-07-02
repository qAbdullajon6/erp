"use client";

import * as React from "react";

export type Role = "admin" | "dispatcher" | "accountant";

export const roleMeta: Record<Role, { label: string; description: string }> = {
  admin: { label: "Admin", description: "Full access to every module" },
  dispatcher: {
    label: "Dispatcher",
    description: "Orders, Dispatch Board, Drivers & Vehicles",
  },
  accountant: {
    label: "Accountant",
    description: "Finance, Reports, Customers",
  },
};

export const roleAllowedPaths: Record<Role, string[]> = {
  admin: ["/", "/orders", "/dispatch", "/drivers", "/customers", "/finance", "/ai-assistant", "/reports"],
  dispatcher: ["/", "/orders", "/dispatch", "/drivers"],
  accountant: ["/", "/finance", "/reports", "/customers"],
};

const STORAGE_KEY = "flowerp:role:v1";

function isRole(value: unknown): value is Role {
  return value === "admin" || value === "dispatcher" || value === "accountant";
}

type Listener = () => void;

class RoleStore {
  private role: Role = "admin";
  private listeners = new Set<Listener>();

  getSnapshot = (): Role => this.role;
  getServerSnapshot = (): Role => this.role;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  hydrate = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (isRole(raw)) {
        this.role = raw;
        this.listeners.forEach((listener) => listener());
      }
    } catch {
      // ignore malformed storage
    }
  };

  setRole = (role: Role) => {
    this.role = role;
    try {
      window.localStorage.setItem(STORAGE_KEY, role);
    } catch {
      // ignore storage write failures
    }
    this.listeners.forEach((listener) => listener());
  };
}

const roleStore = new RoleStore();

export function RoleProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    roleStore.hydrate();
  }, []);

  return <>{children}</>;
}

export function useRole() {
  const role = React.useSyncExternalStore(
    roleStore.subscribe,
    roleStore.getSnapshot,
    roleStore.getServerSnapshot,
  );

  return { role, meta: roleMeta[role], setRole: roleStore.setRole };
}
