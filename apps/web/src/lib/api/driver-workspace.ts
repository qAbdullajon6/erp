import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { unwrapResponse } from './error';
import { apiFetch } from './fetch';
import { useInvalidateOperationalState } from './invalidate';
import {
  deliveryProofKeys,
  driverDispatchKeys,
} from './query-keys';
import type {
  DriverActionableStatus,
  DriverRejectReason,
  MyDelivery,
} from './my-deliveries';
import {
  enqueueOfflineAction,
  fileToOfflinePayload,
  isBrowserOffline,
  isNetworkError,
  isOfflineFilePayload,
  offlinePayloadToFile,
  type OfflineActionType,
  type OfflineFilePayload,
  type OfflineQueuedAction,
  type OfflineQueuedResult,
} from '@/lib/driver/offline-queue';

export type DriverOperationalStatus =
  | 'AVAILABLE'
  | 'BUSY'
  | 'DRIVING'
  | 'LOADING'
  | 'BREAK'
  | 'OFFLINE';

export type ExpenseCategory =
  | 'FUEL'
  | 'TOLL'
  | 'MAINTENANCE'
  | 'DRIVER_ADVANCE'
  | 'PARKING'
  | 'INSURANCE'
  | 'OTHER';

export interface PodChecklistConfig {
  requirePhotos: boolean;
  requireSignature: boolean;
  requireReceiverName: boolean;
  requireReceiverPhone: boolean;
  requireNotes: boolean;
}

export interface DriverWorkspaceProfile {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  status: string;
  operationalStatus: DriverOperationalStatus;
  onBreak: boolean;
  openBreak: { id: string; startedAt: string } | null;
  podChecklist: PodChecklistConfig;
  licenseNumber?: string | null;
  licenseExpiry?: string | null;
}

export interface DriverExpenseRow {
  id: string;
  expenseNumber: string;
  category: ExpenseCategory | string;
  description: string;
  amount: string;
  currency: string;
  status: string;
  notes: string | null;
  hasReceipt?: boolean;
  receiptPath?: string | null;
  odometerKm: string | null;
  expenseDate: string;
  createdAt: string;
}

export interface DriverInspectionPhoto {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export interface DriverInspectionRow {
  id: string;
  vehicleId: string;
  dispatchId: string | null;
  checklist: Record<string, boolean>;
  notes: string | null;
  odometerKm: string | null;
  photos: DriverInspectionPhoto[];
  vehicle?: { id: string; vehicleCode: string; plateNumber: string };
  createdAt: string;
}

export interface DriverInboxNotification {
  id: string;
  type: string;
  category: string;
  severity: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
  metadata: unknown;
}

export interface DriverDeliveryProof {
  id: string;
  dispatchId: string;
  orderId: string | null;
  type: 'PHOTO' | 'SIGNATURE' | string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
  receiverName: string | null;
  receiverPhone: string | null;
  notes: string | null;
  odometerKm: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RejectDispatchInput {
  reason: DriverRejectReason;
  note?: string;
}

export interface UpdateDriverStatusInput {
  status: DriverActionableStatus;
  note?: string;
  lat?: number;
  lng?: number;
}

export interface CreateDriverExpenseInput {
  category: ExpenseCategory;
  description: string;
  amount: number;
  currency?: string;
  notes?: string;
  orderId?: string;
  vehicleId?: string;
  dispatchId?: string;
  odometerKm?: number;
}

export interface CreateDriverFuelInput {
  amount: number;
  liters: number;
  station?: string;
  currency?: string;
  vehicleId?: string;
  dispatchId?: string;
  odometerKm?: number;
  notes?: string;
}

export interface CreateVehicleInspectionInput {
  vehicleId: string;
  dispatchId?: string;
  tyres: boolean;
  lights: boolean;
  brakes: boolean;
  oil: boolean;
  coolant: boolean;
  documents: boolean;
  notes?: string;
  odometerKm?: number;
}

export interface UpdatePodMetaInput {
  receiverName?: string;
  receiverPhone?: string;
  notes?: string;
  odometerKm?: number;
}

export const driverWorkspaceKeys = {
  expenses: () => [...driverDispatchKeys.all, 'expenses'] as const,
  inspections: () => [...driverDispatchKeys.all, 'inspections'] as const,
  inspection: (id: string) => [...driverDispatchKeys.all, 'inspections', id] as const,
  notifications: () => [...driverDispatchKeys.all, 'notifications'] as const,
  proofs: (dispatchId: string) => deliveryProofKeys.list(dispatchId),
};

class DriverWorkspaceAPI {
  async getMe(): Promise<DriverWorkspaceProfile> {
    const response = await apiFetch('/api/drivers/me', { method: 'GET' });
    return unwrapResponse(response, 'Failed to load driver workspace profile');
  }

  async updateOperationalStatus(status: DriverOperationalStatus): Promise<DriverWorkspaceProfile> {
    const response = await apiFetch('/api/drivers/me/operational-status', {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    return unwrapResponse(response, 'Failed to update operational status');
  }

  async startBreak(): Promise<{ id: string; startedAt: string }> {
    const response = await apiFetch('/api/drivers/me/breaks/start', { method: 'POST' });
    return unwrapResponse(response, 'Failed to start break');
  }

  async endBreak(): Promise<{ id: string; startedAt: string; endedAt: string }> {
    const response = await apiFetch('/api/drivers/me/breaks/end', { method: 'POST' });
    return unwrapResponse(response, 'Failed to end break');
  }

  async listExpenses(): Promise<DriverExpenseRow[]> {
    const response = await apiFetch('/api/drivers/me/expenses', { method: 'GET' });
    return unwrapResponse(response, 'Failed to load expenses');
  }

  async createExpense(input: CreateDriverExpenseInput): Promise<DriverExpenseRow> {
    const response = await apiFetch('/api/drivers/me/expenses', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return unwrapResponse(response, 'Failed to submit expense');
  }

  async createFuel(input: CreateDriverFuelInput): Promise<DriverExpenseRow> {
    const response = await apiFetch('/api/drivers/me/expenses/fuel', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return unwrapResponse(response, 'Failed to submit fuel expense');
  }

  async uploadExpenseReceipt(expenseId: string, file: File): Promise<DriverExpenseRow> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiFetch(`/api/drivers/me/expenses/${expenseId}/receipt`, {
      method: 'POST',
      body: formData,
    });
    return unwrapResponse(response, 'Failed to upload receipt');
  }

  async deleteExpenseReceipt(expenseId: string): Promise<DriverExpenseRow> {
    const response = await apiFetch(`/api/drivers/me/expenses/${expenseId}/receipt`, {
      method: 'DELETE',
    });
    return unwrapResponse(response, 'Failed to delete receipt');
  }

  receiptUrl(expenseId: string): string {
    return `/api/drivers/me/expenses/${expenseId}/receipt`;
  }

  async listInspections(): Promise<DriverInspectionRow[]> {
    const response = await apiFetch('/api/drivers/me/inspections', { method: 'GET' });
    return unwrapResponse(response, 'Failed to load inspections');
  }

  async getInspection(id: string): Promise<DriverInspectionRow> {
    const response = await apiFetch(`/api/drivers/me/inspections/${id}`, { method: 'GET' });
    return unwrapResponse(response, 'Failed to load inspection');
  }

  async createInspection(input: CreateVehicleInspectionInput): Promise<DriverInspectionRow> {
    const response = await apiFetch('/api/drivers/me/inspections', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return unwrapResponse(response, 'Failed to submit inspection');
  }

  async uploadInspectionPhoto(inspectionId: string, file: File): Promise<DriverInspectionRow> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiFetch(`/api/drivers/me/inspections/${inspectionId}/photos`, {
      method: 'POST',
      body: formData,
    });
    return unwrapResponse(response, 'Failed to upload inspection photo');
  }

  inspectionPhotoUrl(inspectionId: string, photoId: string): string {
    return `/api/drivers/me/inspections/${inspectionId}/photos/${photoId}`;
  }

  async listNotifications(): Promise<{ items: DriverInboxNotification[] }> {
    const response = await apiFetch('/api/drivers/me/notifications', { method: 'GET' });
    return unwrapResponse(response, 'Failed to load notifications');
  }

  async markNotificationRead(id: string): Promise<{ id: string; isRead: boolean }> {
    const response = await apiFetch(`/api/drivers/me/notifications/${id}/read`, { method: 'POST' });
    return unwrapResponse(response, 'Failed to mark notification read');
  }

  async accept(dispatchId: string): Promise<MyDelivery> {
    const response = await apiFetch(`/api/dispatches/my/${dispatchId}/accept`, { method: 'POST' });
    return unwrapResponse(response, 'Failed to accept dispatch');
  }

  async reject(dispatchId: string, input: RejectDispatchInput): Promise<MyDelivery> {
    const response = await apiFetch(`/api/dispatches/my/${dispatchId}/reject`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return unwrapResponse(response, 'Failed to reject dispatch');
  }

  async updateStatus(dispatchId: string, input: UpdateDriverStatusInput): Promise<MyDelivery> {
    const body: Record<string, unknown> = { status: input.status };
    if (input.note) body.note = input.note;
    if (input.lat != null) body.lat = input.lat;
    if (input.lng != null) body.lng = input.lng;
    const response = await apiFetch(`/api/dispatches/my/${dispatchId}/status`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return unwrapResponse(response, 'Failed to update delivery status');
  }

  async listProofs(dispatchId: string): Promise<{ items: DriverDeliveryProof[] }> {
    const response = await apiFetch(`/api/dispatches/my/${dispatchId}/proofs`, { method: 'GET' });
    return unwrapResponse(response, 'Failed to load proofs');
  }

  async uploadPhoto(dispatchId: string, file: File): Promise<DriverDeliveryProof> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiFetch(`/api/dispatches/my/${dispatchId}/proofs/photo`, {
      method: 'POST',
      body: formData,
    });
    return unwrapResponse(response, 'Failed to upload photo');
  }

  async uploadSignature(dispatchId: string, file: File): Promise<DriverDeliveryProof> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiFetch(`/api/dispatches/my/${dispatchId}/proofs/signature`, {
      method: 'POST',
      body: formData,
    });
    return unwrapResponse(response, 'Failed to upload signature');
  }

  async updatePodMeta(dispatchId: string, input: UpdatePodMetaInput): Promise<DriverDeliveryProof> {
    const response = await apiFetch(`/api/dispatches/my/${dispatchId}/proofs/meta`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return unwrapResponse(response, 'Failed to update POD meta');
  }
}

export const driverWorkspaceAPI = new DriverWorkspaceAPI();

export type OfflineAwareResult<T> = T | OfflineQueuedResult;

type OfflinePayloadInput =
  | Record<string, unknown>
  | (() => Record<string, unknown> | Promise<Record<string, unknown>>);

async function resolveOfflinePayload(input: OfflinePayloadInput): Promise<Record<string, unknown>> {
  return typeof input === 'function' ? input() : input;
}

/**
 * Runs `execute` when online; on offline / network failure enqueues and resolves
 * with `{ queued: true }` so mutateAsync callers can treat it as soft success.
 */
export async function withOfflineSupport<T>(
  type: OfflineActionType,
  payload: OfflinePayloadInput,
  clientKey: string,
  execute: () => Promise<T>,
): Promise<OfflineAwareResult<T>> {
  if (isBrowserOffline()) {
    const action = enqueueOfflineAction(type, await resolveOfflinePayload(payload), clientKey);
    toast.info('Saved offline — will sync when online');
    return { queued: true, action };
  }

  try {
    return await execute();
  } catch (err) {
    if (isNetworkError(err)) {
      const action = enqueueOfflineAction(type, await resolveOfflinePayload(payload), clientKey);
      toast.info('Saved offline — will sync when online');
      return { queued: true, action };
    }
    throw err;
  }
}

/** Replay a queued action against the live API. Returns true on success. */
export async function replayDriverOfflineAction(action: OfflineQueuedAction): Promise<boolean> {
  const p = action.payload;
  switch (action.type) {
    case 'STATUS_UPDATE': {
      const dispatchId = String(p.dispatchId ?? '');
      await driverWorkspaceAPI.updateStatus(dispatchId, {
        status: p.status as DriverActionableStatus,
        note: typeof p.note === 'string' ? p.note : undefined,
        lat: typeof p.lat === 'number' ? p.lat : undefined,
        lng: typeof p.lng === 'number' ? p.lng : undefined,
      });
      return true;
    }
    case 'ACCEPT': {
      await driverWorkspaceAPI.accept(String(p.dispatchId ?? ''));
      return true;
    }
    case 'REJECT': {
      await driverWorkspaceAPI.reject(String(p.dispatchId ?? ''), {
        reason: p.reason as DriverRejectReason,
        note: typeof p.note === 'string' ? p.note : undefined,
      });
      return true;
    }
    case 'BREAK_START': {
      await driverWorkspaceAPI.startBreak();
      return true;
    }
    case 'BREAK_END': {
      await driverWorkspaceAPI.endBreak();
      return true;
    }
    case 'EXPENSE': {
      await driverWorkspaceAPI.createExpense(p as unknown as CreateDriverExpenseInput);
      return true;
    }
    case 'FUEL': {
      await driverWorkspaceAPI.createFuel(p as unknown as CreateDriverFuelInput);
      return true;
    }
    case 'INSPECTION': {
      await driverWorkspaceAPI.createInspection(p as unknown as CreateVehicleInspectionInput);
      return true;
    }
    case 'POD_PHOTO': {
      const dispatchId = String(p.dispatchId ?? '');
      if (!isOfflineFilePayload(p.file)) throw new Error('Missing POD photo payload');
      await driverWorkspaceAPI.uploadPhoto(dispatchId, offlinePayloadToFile(p.file as OfflineFilePayload));
      return true;
    }
    case 'POD_SIGNATURE': {
      const dispatchId = String(p.dispatchId ?? '');
      if (!isOfflineFilePayload(p.file)) throw new Error('Missing POD signature payload');
      await driverWorkspaceAPI.uploadSignature(dispatchId, offlinePayloadToFile(p.file as OfflineFilePayload));
      return true;
    }
    case 'POD_META': {
      const dispatchId = String(p.dispatchId ?? '');
      const { dispatchId: _d, ...meta } = p;
      await driverWorkspaceAPI.updatePodMeta(dispatchId, meta as UpdatePodMetaInput);
      return true;
    }
    default:
      throw new Error(`Unknown offline action type: ${action.type as string}`);
  }
}

export function useDriverWorkspaceProfileQuery(enabled = true) {
  return useQuery({
    queryKey: driverDispatchKeys.profile(),
    queryFn: () => driverWorkspaceAPI.getMe(),
    enabled,
    retry: false,
  });
}

export function useDriverExpensesQuery(enabled = true) {
  return useQuery({
    queryKey: driverWorkspaceKeys.expenses(),
    queryFn: () => driverWorkspaceAPI.listExpenses(),
    enabled,
  });
}

export function useDriverProofsQuery(dispatchId: string, enabled = true) {
  return useQuery({
    queryKey: driverWorkspaceKeys.proofs(dispatchId),
    queryFn: () => driverWorkspaceAPI.listProofs(dispatchId),
    enabled: enabled && Boolean(dispatchId),
  });
}

function useWorkspaceInvalidate() {
  const invalidateOperational = useInvalidateOperationalState();
  const queryClient = useQueryClient();
  return async () => {
    await invalidateOperational();
    await queryClient.invalidateQueries({ queryKey: driverWorkspaceKeys.expenses() });
    await queryClient.invalidateQueries({ queryKey: driverWorkspaceKeys.inspections() });
    await queryClient.invalidateQueries({ queryKey: driverWorkspaceKeys.notifications() });
  };
}

export function useDriverInspectionsQuery(enabled = true) {
  return useQuery({
    queryKey: driverWorkspaceKeys.inspections(),
    queryFn: () => driverWorkspaceAPI.listInspections(),
    enabled,
  });
}

export function useDriverInspectionQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: driverWorkspaceKeys.inspection(id),
    queryFn: () => driverWorkspaceAPI.getInspection(id),
    enabled: enabled && Boolean(id),
  });
}

export function useDriverInboxNotificationsQuery(enabled = true) {
  return useQuery({
    queryKey: driverWorkspaceKeys.notifications(),
    queryFn: () => driverWorkspaceAPI.listNotifications(),
    enabled,
  });
}

export function useUploadExpenseReceiptMutation() {
  const invalidate = useWorkspaceInvalidate();
  return useMutation({
    mutationFn: ({ expenseId, file }: { expenseId: string; file: File }) =>
      driverWorkspaceAPI.uploadExpenseReceipt(expenseId, file),
    onSuccess: invalidate,
  });
}

export function useDeleteExpenseReceiptMutation() {
  const invalidate = useWorkspaceInvalidate();
  return useMutation({
    mutationFn: (expenseId: string) => driverWorkspaceAPI.deleteExpenseReceipt(expenseId),
    onSuccess: invalidate,
  });
}

export function useUploadInspectionPhotoMutation() {
  const invalidate = useWorkspaceInvalidate();
  return useMutation({
    mutationFn: ({ inspectionId, file }: { inspectionId: string; file: File }) =>
      driverWorkspaceAPI.uploadInspectionPhoto(inspectionId, file),
    onSuccess: invalidate,
  });
}

export function useAcceptDispatchMutation(dispatchId: string) {
  const invalidate = useWorkspaceInvalidate();
  return useMutation({
    mutationFn: () => driverWorkspaceAPI.accept(dispatchId),
    onSuccess: invalidate,
  });
}

export function useRejectDispatchMutation(dispatchId: string) {
  const invalidate = useWorkspaceInvalidate();
  return useMutation({
    mutationFn: (input: RejectDispatchInput) => driverWorkspaceAPI.reject(dispatchId, input),
    onSuccess: invalidate,
  });
}

export function useDriverStatusMutation(dispatchId: string) {
  const invalidate = useWorkspaceInvalidate();
  return useMutation({
    mutationFn: (input: UpdateDriverStatusInput) =>
      withOfflineSupport(
        'STATUS_UPDATE',
        { dispatchId, ...input },
        `status:${dispatchId}:${input.status}`,
        () => driverWorkspaceAPI.updateStatus(dispatchId, input),
      ),
    onSuccess: (result) => {
      if (result && typeof result === 'object' && 'queued' in result && result.queued) return;
      return invalidate();
    },
  });
}

export function useUpdateOperationalStatusMutation() {
  const invalidate = useWorkspaceInvalidate();
  return useMutation({
    mutationFn: (status: DriverOperationalStatus) => driverWorkspaceAPI.updateOperationalStatus(status),
    onSuccess: invalidate,
  });
}

export function useStartBreakMutation() {
  const invalidate = useWorkspaceInvalidate();
  return useMutation({
    mutationFn: () => driverWorkspaceAPI.startBreak(),
    onSuccess: invalidate,
  });
}

export function useEndBreakMutation() {
  const invalidate = useWorkspaceInvalidate();
  return useMutation({
    mutationFn: () => driverWorkspaceAPI.endBreak(),
    onSuccess: invalidate,
  });
}

export function useCreateDriverExpenseMutation() {
  const invalidate = useWorkspaceInvalidate();
  return useMutation({
    mutationFn: (input: CreateDriverExpenseInput) =>
      withOfflineSupport(
        'EXPENSE',
        { ...input },
        `expense:${crypto.randomUUID()}`,
        () => driverWorkspaceAPI.createExpense(input),
      ),
    onSuccess: (result) => {
      if (result && typeof result === 'object' && 'queued' in result && result.queued) return;
      return invalidate();
    },
  });
}

export function useCreateDriverFuelMutation() {
  const invalidate = useWorkspaceInvalidate();
  return useMutation({
    mutationFn: (input: CreateDriverFuelInput) =>
      withOfflineSupport(
        'FUEL',
        { ...input },
        `fuel:${crypto.randomUUID()}`,
        () => driverWorkspaceAPI.createFuel(input),
      ),
    onSuccess: (result) => {
      if (result && typeof result === 'object' && 'queued' in result && result.queued) return;
      return invalidate();
    },
  });
}

export function useCreateInspectionMutation() {
  const invalidate = useWorkspaceInvalidate();
  return useMutation({
    mutationFn: (input: CreateVehicleInspectionInput) =>
      withOfflineSupport(
        'INSPECTION',
        { ...input },
        `inspection:${input.vehicleId}:${crypto.randomUUID()}`,
        () => driverWorkspaceAPI.createInspection(input),
      ),
    onSuccess: (result) => {
      if (result && typeof result === 'object' && 'queued' in result && result.queued) return;
      return invalidate();
    },
  });
}

export function useUploadDriverPhotoMutation(dispatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      withOfflineSupport(
        'POD_PHOTO',
        async () => ({ dispatchId, file: await fileToOfflinePayload(file) }),
        `pod-photo:${dispatchId}:${file.name}:${file.size}:${file.lastModified}`,
        () => driverWorkspaceAPI.uploadPhoto(dispatchId, file),
      ),
    onSuccess: (result) => {
      if (result && typeof result === 'object' && 'queued' in result && result.queued) return;
      return queryClient.invalidateQueries({ queryKey: driverWorkspaceKeys.proofs(dispatchId) });
    },
  });
}

export function useUploadDriverSignatureMutation(dispatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      withOfflineSupport(
        'POD_SIGNATURE',
        async () => ({ dispatchId, file: await fileToOfflinePayload(file) }),
        `pod-sig:${dispatchId}:${file.name}:${file.size}:${file.lastModified}`,
        () => driverWorkspaceAPI.uploadSignature(dispatchId, file),
      ),
    onSuccess: (result) => {
      if (result && typeof result === 'object' && 'queued' in result && result.queued) return;
      return queryClient.invalidateQueries({ queryKey: driverWorkspaceKeys.proofs(dispatchId) });
    },
  });
}

export function useUpdatePodMetaMutation(dispatchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePodMetaInput) =>
      withOfflineSupport(
        'POD_META',
        { dispatchId, ...input },
        `pod-meta:${dispatchId}:${JSON.stringify(input)}`,
        () => driverWorkspaceAPI.updatePodMeta(dispatchId, input),
      ),
    onSuccess: (result) => {
      if (result && typeof result === 'object' && 'queued' in result && result.queued) return;
      return queryClient.invalidateQueries({ queryKey: driverWorkspaceKeys.proofs(dispatchId) });
    },
  });
}
