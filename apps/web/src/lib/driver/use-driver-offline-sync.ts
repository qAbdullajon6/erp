'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  dismissOfflineAction,
  flushOfflineQueue,
  listOfflineActions,
  retryOfflineAction,
  subscribeOfflineQueue,
  type OfflineQueuedAction,
} from './offline-queue';
import { replayDriverOfflineAction } from '@/lib/api/driver-workspace';

export function useDriverOfflineSync() {
  const [queue, setQueue] = useState<OfflineQueuedAction[]>(() => listOfflineActions());
  const [isFlushing, setIsFlushing] = useState(false);

  const refresh = useCallback(() => {
    setQueue(listOfflineActions());
  }, []);

  const flush = useCallback(async () => {
    if (isFlushing) return { flushed: [] as string[], remaining: listOfflineActions().length, failed: [] as string[] };
    setIsFlushing(true);
    try {
      const result = await flushOfflineQueue(replayDriverOfflineAction);
      refresh();
      return result;
    } finally {
      setIsFlushing(false);
    }
  }, [isFlushing, refresh]);

  useEffect(() => subscribeOfflineQueue(refresh), [refresh]);

  useEffect(() => {
    const onOnline = () => {
      void flush();
    };
    window.addEventListener('online', onOnline);
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      const pending = listOfflineActions().some((a) => a.status === 'pending');
      if (pending) void flush();
    }
    return () => window.removeEventListener('online', onOnline);
    // Intentionally mount-once: flush identity is stable enough via isFlushing guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      dismissOfflineAction(id);
      refresh();
    },
    [refresh],
  );

  const retry = useCallback(
    (id: string) => {
      retryOfflineAction(id);
      refresh();
      void flush();
    },
    [flush, refresh],
  );

  const retryAll = useCallback(async () => {
    for (const item of listOfflineActions()) {
      if (item.status === 'failed') retryOfflineAction(item.id);
    }
    refresh();
    return flush();
  }, [flush, refresh]);

  const pendingCount = queue.filter((a) => a.status === 'pending' || a.status === 'syncing').length;
  const failedCount = queue.filter((a) => a.status === 'failed').length;

  return {
    queue,
    pendingCount,
    failedCount,
    totalCount: queue.length,
    isFlushing,
    flush,
    dismiss,
    retry,
    retryAll,
    refresh,
  };
}
