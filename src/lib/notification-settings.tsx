"use client";

import * as React from "react";
import type { NotificationCategory } from "@/lib/notifications";

export interface NotificationThresholds {
  deliveryDueSoonHours: number;
  unassignedOrderHours: number;
  invoiceDueSoonDays: number;
  deliveredWithoutInvoiceDays: number;
  maintenanceDueSoonDays: number;
  documentExpiryDueSoonDays: number;
  creditLimitWarningPercent: number;
}

export type NotificationCategoryToggles = Record<NotificationCategory, boolean>;

export interface NotificationSettings {
  categories: NotificationCategoryToggles;
  thresholds: NotificationThresholds;
}

export const defaultNotificationSettings: NotificationSettings = {
  categories: {
    operations: true,
    finance: true,
    fleet: true,
    customers: true,
    system: true,
  },
  thresholds: {
    deliveryDueSoonHours: 2,
    unassignedOrderHours: 3,
    invoiceDueSoonDays: 3,
    deliveredWithoutInvoiceDays: 2,
    maintenanceDueSoonDays: 14,
    documentExpiryDueSoonDays: 30,
    creditLimitWarningPercent: 90,
  },
};

const STORAGE_KEY = "flowerp:notification-settings:v1";

type Listener = () => void;

class NotificationSettingsStore {
  private settings: NotificationSettings = defaultNotificationSettings;
  private listeners = new Set<Listener>();

  getSnapshot = (): NotificationSettings => this.settings;
  getServerSnapshot = (): NotificationSettings => this.settings;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private commit(next: NotificationSettings) {
    this.settings = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    this.listeners.forEach((listener) => listener());
  }

  hydrate = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as NotificationSettings;
        this.settings = {
          categories: { ...defaultNotificationSettings.categories, ...parsed.categories },
          thresholds: { ...defaultNotificationSettings.thresholds, ...parsed.thresholds },
        };
        this.listeners.forEach((listener) => listener());
      }
    } catch {
      // ignore malformed storage
    }
  };

  setCategoryEnabled = (category: NotificationCategory, enabled: boolean) => {
    this.commit({
      ...this.settings,
      categories: { ...this.settings.categories, [category]: enabled },
    });
  };

  setThreshold = <K extends keyof NotificationThresholds>(key: K, value: NotificationThresholds[K]) => {
    this.commit({
      ...this.settings,
      thresholds: { ...this.settings.thresholds, [key]: value },
    });
  };

  resetToDefaults = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    this.commit(defaultNotificationSettings);
  };
}

const store = new NotificationSettingsStore();

export function NotificationSettingsProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    store.hydrate();
  }, []);

  return <>{children}</>;
}

export function useNotificationSettings() {
  const settings = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  return {
    settings,
    setCategoryEnabled: store.setCategoryEnabled,
    setThreshold: store.setThreshold,
    resetToDefaults: store.resetToDefaults,
  };
}
