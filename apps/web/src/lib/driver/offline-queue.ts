export type OfflineActionType =
  | 'STATUS_UPDATE'
  | 'ACCEPT'
  | 'REJECT'
  | 'BREAK_START'
  | 'BREAK_END'
  | 'EXPENSE'
  | 'FUEL'
  | 'INSPECTION'
  | 'POD_PHOTO'
  | 'POD_SIGNATURE'
  | 'POD_META';

export type OfflineQueueItemStatus = 'pending' | 'failed' | 'syncing';

export interface OfflineFilePayload {
  name: string;
  mimeType: string;
  base64: string;
}

export interface OfflineQueuedAction {
  id: string;
  type: OfflineActionType;
  payload: Record<string, unknown>;
  clientKey: string;
  createdAt: string;
  attempts: number;
  status: OfflineQueueItemStatus;
  lastError?: string;
}

export const MAX_OFFLINE_ATTEMPTS = 5;
/** ~4MB raw file size before base64 expansion. */
export const MAX_OFFLINE_FILE_BYTES = 4 * 1024 * 1024;

export const OFFLINE_QUEUE_STORAGE_KEY = 'flowerp.driver.offlineQueue';
export const OFFLINE_QUEUE_CHANGED_EVENT = 'flowerp.driver.offlineQueue.changed';

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function notifyQueueChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OFFLINE_QUEUE_CHANGED_EVENT));
}

function readQueue(): OfflineQueuedAction[] {
  const storage = getLocalStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineQueuedAction[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeAction);
  } catch {
    return [];
  }
}

function normalizeAction(raw: OfflineQueuedAction): OfflineQueuedAction {
  const status: OfflineQueueItemStatus =
    raw.status === 'failed' || raw.status === 'syncing' || raw.status === 'pending'
      ? raw.status
      : 'pending';
  return {
    id: raw.id,
    type: raw.type,
    payload: raw.payload ?? {},
    clientKey: raw.clientKey || raw.id,
    createdAt: raw.createdAt || new Date().toISOString(),
    attempts: typeof raw.attempts === 'number' ? raw.attempts : 0,
    status,
    lastError: raw.lastError,
  };
}

function writeQueue(items: OfflineQueuedAction[]): void {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(items));
  notifyQueueChanged();
}

export function listOfflineActions(): OfflineQueuedAction[] {
  return readQueue();
}

export function subscribeOfflineQueue(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onChange = () => listener();
  window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function isOfflineFilePayload(value: unknown): value is OfflineFilePayload {
  if (!value || typeof value !== 'object') return false;
  const file = value as OfflineFilePayload;
  return (
    typeof file.name === 'string' &&
    typeof file.mimeType === 'string' &&
    typeof file.base64 === 'string'
  );
}

export { isOfflineFilePayload };

function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function assertFilePayloadSize(payload: Record<string, unknown>): void {
  const file = payload.file;
  if (!isOfflineFilePayload(file)) return;
  const bytes = estimateBase64Bytes(file.base64);
  if (bytes > MAX_OFFLINE_FILE_BYTES) {
    throw new Error(`File too large for offline queue (max ${MAX_OFFLINE_FILE_BYTES} bytes)`);
  }
}

/**
 * Enqueue an action. If a pending/syncing item with the same clientKey already
 * exists, returns that item and does not create a duplicate.
 */
export function enqueueOfflineAction(
  type: OfflineActionType,
  payload: Record<string, unknown>,
  clientKey: string,
): OfflineQueuedAction {
  assertFilePayloadSize(payload);

  const queue = readQueue();
  const existing = queue.find(
    (item) =>
      item.clientKey === clientKey &&
      (item.status === 'pending' || item.status === 'syncing'),
  );
  if (existing) return existing;

  const action: OfflineQueuedAction = {
    id: crypto.randomUUID(),
    type,
    payload,
    clientKey,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: 'pending',
  };
  writeQueue([...queue, action]);
  return action;
}

export function dequeueOfflineAction(id: string): OfflineQueuedAction | null {
  const queue = readQueue();
  const idx = queue.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  const [removed] = queue.splice(idx, 1);
  writeQueue(queue);
  return removed ?? null;
}

export function dismissOfflineAction(id: string): boolean {
  return dequeueOfflineAction(id) != null;
}

/** Reset a failed item so the next flush will try it again. */
export function retryOfflineAction(id: string): OfflineQueuedAction | null {
  const queue = readQueue();
  const idx = queue.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  const item = queue[idx]!;
  const next: OfflineQueuedAction = {
    ...item,
    status: 'pending',
    attempts: 0,
    lastError: undefined,
  };
  queue[idx] = next;
  writeQueue(queue);
  return next;
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    return /failed to fetch|networkerror|load failed|network request failed/i.test(error.message);
  }
  return false;
}

export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Flush pending items FIFO. Success removes the item; failure increments
 * attempts and marks `failed` once max attempts is reached. Already-failed
 * items are left alone until manual retry/dismiss.
 */
export async function flushOfflineQueue(
  handler: (action: OfflineQueuedAction) => Promise<boolean>,
): Promise<{ flushed: string[]; remaining: number; failed: string[] }> {
  const snapshot = readQueue();
  const flushed: string[] = [];
  const failedIds: string[] = [];
  const remaining: OfflineQueuedAction[] = [];

  const persistProgress = (current: OfflineQueuedAction | null, index: number) => {
    const tail = snapshot.slice(index + 1);
    writeQueue(current ? [...remaining, current, ...tail] : [...remaining, ...tail]);
  };

  for (let i = 0; i < snapshot.length; i++) {
    const action = snapshot[i]!;

    if (action.status === 'failed') {
      remaining.push(action);
      persistProgress(null, i);
      continue;
    }

    const syncing: OfflineQueuedAction = { ...action, status: 'syncing' };
    persistProgress(syncing, i);

    try {
      const ok = await handler(syncing);
      if (ok) {
        flushed.push(action.id);
        persistProgress(null, i);
        continue;
      }
      const attempts = action.attempts + 1;
      const next: OfflineQueuedAction = {
        ...action,
        attempts,
        status: attempts >= MAX_OFFLINE_ATTEMPTS ? 'failed' : 'pending',
        lastError: 'Sync handler returned false',
      };
      if (next.status === 'failed') failedIds.push(action.id);
      remaining.push(next);
    } catch (err) {
      const attempts = action.attempts + 1;
      const message = err instanceof Error ? err.message : 'Sync failed';
      const next: OfflineQueuedAction = {
        ...action,
        attempts,
        status: attempts >= MAX_OFFLINE_ATTEMPTS ? 'failed' : 'pending',
        lastError: message,
      };
      if (next.status === 'failed') failedIds.push(action.id);
      remaining.push(next);
    }

    persistProgress(null, i);
  }

  writeQueue(remaining);
  return { flushed, remaining: remaining.length, failed: failedIds };
}

export function clearOfflineQueue(): void {
  writeQueue([]);
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read file'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function fileToOfflinePayload(file: File): Promise<OfflineFilePayload> {
  if (file.size > MAX_OFFLINE_FILE_BYTES) {
    throw new Error(`File too large for offline queue (max ${MAX_OFFLINE_FILE_BYTES} bytes)`);
  }
  const base64 = await readFileAsBase64(file);
  return {
    name: file.name || 'upload.bin',
    mimeType: file.type || 'application/octet-stream',
    base64,
  };
}

export function offlinePayloadToFile(payload: OfflineFilePayload): File {
  const binary = atob(payload.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], payload.name, { type: payload.mimeType });
}

export type OfflineQueuedResult = { queued: true; action: OfflineQueuedAction };

export function isOfflineQueuedResult(value: unknown): value is OfflineQueuedResult {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as OfflineQueuedResult).queued === true &&
    Boolean((value as OfflineQueuedResult).action)
  );
}

export class OfflineQueuedError extends Error {
  readonly queued = true as const;
  readonly action: OfflineQueuedAction;

  constructor(action: OfflineQueuedAction) {
    super('Saved offline — will sync when online');
    this.name = 'OfflineQueuedError';
    this.action = action;
  }
}

export function isOfflineQueuedError(error: unknown): error is OfflineQueuedError {
  return error instanceof OfflineQueuedError || (
    Boolean(error) &&
    typeof error === 'object' &&
    (error as OfflineQueuedError).queued === true &&
    (error as OfflineQueuedError).name === 'OfflineQueuedError'
  );
}
