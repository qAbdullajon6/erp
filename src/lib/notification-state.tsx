"use client";

import * as React from "react";

export interface NotificationStateEntry {
  read: boolean;
  archived: boolean;
}

type NotificationStateMap = Record<string, NotificationStateEntry>;

const STORAGE_KEY = "flowerp:notification-state:v1";

type Listener = () => void;

class NotificationStateStore {
  private state: NotificationStateMap = {};
  private listeners = new Set<Listener>();

  getSnapshot = (): NotificationStateMap => this.state;
  getServerSnapshot = (): NotificationStateMap => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private commit(next: NotificationStateMap) {
    this.state = next;
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
        this.state = JSON.parse(raw) as NotificationStateMap;
        this.listeners.forEach((listener) => listener());
      }
    } catch {
      // ignore malformed storage
    }
  };

  private entry(id: string): NotificationStateEntry {
    return this.state[id] ?? { read: false, archived: false };
  }

  markRead = (id: string) => {
    this.commit({ ...this.state, [id]: { ...this.entry(id), read: true } });
  };

  markAllRead = (ids: string[]) => {
    const next = { ...this.state };
    for (const id of ids) next[id] = { ...this.entry(id), read: true };
    this.commit(next);
  };

  archive = (id: string) => {
    this.commit({ ...this.state, [id]: { ...this.entry(id), archived: true, read: true } });
  };

  archiveAllRead = (ids: string[]) => {
    const next = { ...this.state };
    for (const id of ids) {
      const current = this.entry(id);
      if (current.read) next[id] = { ...current, archived: true };
    }
    this.commit(next);
  };
}

const store = new NotificationStateStore();

export function NotificationStateProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    store.hydrate();
  }, []);

  return <>{children}</>;
}

export function useNotificationState() {
  const state = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  return {
    state,
    isRead: (id: string) => state[id]?.read ?? false,
    isArchived: (id: string) => state[id]?.archived ?? false,
    markRead: store.markRead,
    markAllRead: store.markAllRead,
    archive: store.archive,
    archiveAllRead: store.archiveAllRead,
  };
}
