"use client";

import * as React from "react";

export type Role = "admin" | "ops_manager" | "dispatcher" | "accountant" | "driver" | "sales";

export const roleMeta: Record<
  Role,
  { label: string; description: string; personName: string; initials: string }
> = {
  admin: {
    label: "Admin / Owner",
    description: "Full access to every module and setting",
    personName: "Oyatillo Farhadov",
    initials: "OF",
  },
  ops_manager: {
    label: "Operations Manager",
    description: "Oversees orders, dispatch, fleet, customers and reports",
    personName: "Nodira Karimova",
    initials: "NK",
  },
  dispatcher: {
    label: "Dispatcher",
    description: "Assigns drivers and manages the Dispatch Board",
    personName: "Jahongir Mirzayev",
    initials: "JM",
  },
  accountant: {
    label: "Accountant",
    description: "Manages invoices, payments and financial reporting",
    personName: "Sabina Yusupova",
    initials: "SY",
  },
  driver: {
    label: "Driver",
    description: "Views and updates assigned deliveries only",
    personName: "Aziz Karimov",
    initials: "AK",
  },
  sales: {
    label: "Sales / CRM Manager",
    description: "Manages customers and creates new orders",
    personName: "Dilnoza Ergasheva",
    initials: "DE",
  },
};

export const roleOrder: Role[] = [
  "admin",
  "ops_manager",
  "dispatcher",
  "accountant",
  "driver",
  "sales",
];

/** The single driver identity the demo signs in as when "Driver" role is selected. */
export const DEMO_DRIVER_ID = "drv-1";

export const roleAllowedPaths: Record<Role, string[]> = {
  admin: [
    "/",
    "/orders",
    "/dispatch",
    "/drivers",
    "/customers",
    "/finance",
    "/ai-assistant",
    "/reports",
    "/notifications",
    "/my-deliveries",
  ],
  ops_manager: [
    "/",
    "/orders",
    "/dispatch",
    "/drivers",
    "/customers",
    "/reports",
    "/notifications",
    "/ai-assistant",
  ],
  dispatcher: ["/", "/orders", "/dispatch", "/drivers", "/notifications"],
  accountant: ["/", "/finance", "/customers", "/reports", "/notifications", "/ai-assistant"],
  driver: ["/", "/my-deliveries", "/notifications"],
  sales: ["/", "/customers", "/orders", "/notifications", "/ai-assistant"],
};

export const roleHomePath: Record<Role, string> = {
  admin: "/",
  ops_manager: "/",
  dispatcher: "/",
  accountant: "/",
  driver: "/my-deliveries",
  sales: "/",
};

const STORAGE_KEY = "flowerp:role:v2";

function isRole(value: unknown): value is Role {
  return (
    value === "admin" ||
    value === "ops_manager" ||
    value === "dispatcher" ||
    value === "accountant" ||
    value === "driver" ||
    value === "sales"
  );
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
