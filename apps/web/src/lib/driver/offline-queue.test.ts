import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearOfflineQueue,
  enqueueOfflineAction,
  flushOfflineQueue,
  listOfflineActions,
  MAX_OFFLINE_ATTEMPTS,
  OFFLINE_QUEUE_STORAGE_KEY,
} from './offline-queue';

function installLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('window', {
    localStorage,
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  return store;
}

beforeEach(() => {
  installLocalStorage();
  clearOfflineQueue();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('offline-queue', () => {
  it('enqueues actions in FIFO order', () => {
    const a = enqueueOfflineAction('STATUS_UPDATE', { status: 'IN_TRANSIT' }, 'k1');
    const b = enqueueOfflineAction('EXPENSE', { amount: 10 }, 'k2');
    const c = enqueueOfflineAction('FUEL', { liters: 20 }, 'k3');

    const queue = listOfflineActions();
    expect(queue.map((item) => item.id)).toEqual([a.id, b.id, c.id]);
    expect(queue.every((item) => item.status === 'pending')).toBe(true);
    expect(localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY)).toBeTruthy();
  });

  it('dedupes by clientKey while a pending item exists', () => {
    const first = enqueueOfflineAction('STATUS_UPDATE', { status: 'AT_PICKUP' }, 'status:d1:AT_PICKUP');
    const second = enqueueOfflineAction(
      'STATUS_UPDATE',
      { status: 'AT_PICKUP', note: 'retry' },
      'status:d1:AT_PICKUP',
    );

    expect(second.id).toBe(first.id);
    expect(listOfflineActions()).toHaveLength(1);
  });

  it('flush success removes items in FIFO order', async () => {
    enqueueOfflineAction('EXPENSE', { amount: 1 }, 'e1');
    enqueueOfflineAction('FUEL', { liters: 2 }, 'f1');

    const seen: string[] = [];
    const result = await flushOfflineQueue(async (action) => {
      seen.push(action.clientKey);
      return true;
    });

    expect(seen).toEqual(['e1', 'f1']);
    expect(result.flushed).toHaveLength(2);
    expect(result.remaining).toBe(0);
    expect(listOfflineActions()).toHaveLength(0);
  });

  it('flush failure increments attempts and keeps the item', async () => {
    enqueueOfflineAction('POD_META', { receiverName: 'Ada' }, 'meta1');

    const result = await flushOfflineQueue(async () => {
      throw new Error('network down');
    });

    expect(result.flushed).toHaveLength(0);
    expect(result.remaining).toBe(1);
    const [item] = listOfflineActions();
    expect(item?.attempts).toBe(1);
    expect(item?.status).toBe('pending');
    expect(item?.lastError).toBe('network down');
  });

  it('marks item failed after max attempts and leaves it in the queue', async () => {
    enqueueOfflineAction('INSPECTION', { vehicleId: 'v1' }, 'insp1');

    for (let i = 0; i < MAX_OFFLINE_ATTEMPTS; i++) {
      await flushOfflineQueue(async () => false);
    }

    const [item] = listOfflineActions();
    expect(item?.attempts).toBe(MAX_OFFLINE_ATTEMPTS);
    expect(item?.status).toBe('failed');

    // Failed items are skipped on subsequent flushes until manual retry.
    const again = await flushOfflineQueue(async () => true);
    expect(again.flushed).toHaveLength(0);
    expect(listOfflineActions()).toHaveLength(1);
    expect(listOfflineActions()[0]?.status).toBe('failed');
  });
});
