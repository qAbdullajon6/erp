"use client";

import * as React from "react";

export interface DemoGuideStep {
  id: string;
  title: string;
  description: string;
  href: string;
}

export const demoGuideSteps: DemoGuideStep[] = [
  {
    id: "dashboard",
    title: "Review the live operations dashboard",
    description: "See today's orders, active deliveries, revenue and fleet status at a glance.",
    href: "/",
  },
  {
    id: "orders",
    title: "Create or inspect an order",
    description: "Open Orders and view an existing order's details and status history.",
    href: "/orders",
  },
  {
    id: "dispatch",
    title: "Assign a driver and vehicle in Dispatch",
    description: "See how the Dispatch Board matches available drivers and vehicles to open orders.",
    href: "/dispatch",
  },
  {
    id: "customers",
    title: "Review a customer profile",
    description: "Open a customer to see credit limit, order history, invoices and activity timeline.",
    href: "/customers",
  },
  {
    id: "finance",
    title: "Record an invoice, payment or expense",
    description: "Explore Finance to record a payment or approve an expense.",
    href: "/finance",
  },
  {
    id: "reports",
    title: "Explore reports and alerts",
    description: "Check the Executive Overview, Operations and Financial reports, then the Notification Center.",
    href: "/reports",
  },
  {
    id: "ai-assistant",
    title: "Ask the AI Assistant a suggested question",
    description: "Try a suggested prompt like \"Which deliveries are delayed today?\"",
    href: "/ai-assistant",
  },
  {
    id: "roles",
    title: "Switch roles and open My Deliveries",
    description: "Use the role switcher to preview the Driver role and its delivery checklist.",
    href: "/my-deliveries",
  },
];

const STORAGE_KEY = "flowerp:demo-guide:v1";

type Listener = () => void;

class DemoGuideStore {
  private completed = new Set<string>();
  /** Ephemeral UI state (not persisted) so any component can open the same dialog instance. */
  private open = false;
  private listeners = new Set<Listener>();

  getSnapshot = (): Set<string> => this.completed;
  getServerSnapshot = (): Set<string> => this.completed;

  getOpenSnapshot = (): boolean => this.open;
  getOpenServerSnapshot = (): boolean => this.open;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setOpen = (open: boolean) => {
    this.open = open;
    this.listeners.forEach((listener) => listener());
  };

  private commit(next: Set<string>) {
    this.completed = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
    } catch {
      // ignore storage write failures
    }
    this.listeners.forEach((listener) => listener());
  }

  hydrate = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) {
          this.completed = new Set(parsed);
          this.listeners.forEach((listener) => listener());
        }
      }
    } catch {
      // ignore malformed storage
    }
  };

  toggleStep = (id: string) => {
    const next = new Set(this.completed);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.commit(next);
  };

  reset = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    this.commit(new Set());
  };
}

const store = new DemoGuideStore();

export function DemoGuideProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    store.hydrate();
  }, []);

  return <>{children}</>;
}

export function useDemoGuide() {
  const completed = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const open = React.useSyncExternalStore(
    store.subscribe,
    store.getOpenSnapshot,
    store.getOpenServerSnapshot,
  );

  return {
    completed,
    toggleStep: store.toggleStep,
    reset: store.reset,
    open,
    setOpen: store.setOpen,
  };
}
