import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './fetch';
import { unwrapResponse as unwrap } from './error';
import { describeError } from './describe-error';

/// Client for `GET/POST/PATCH /telematics/devices` and archive/restore/rotate.
/// Roles: ADMIN + OPERATIONS_MANAGER only (TelematicsDevicesController).

export type TelematicsProviderType =
  | 'MANUAL'
  | 'TRACCAR'
  | 'SAMSARA'
  | 'GEOTAB'
  | 'GENERIC_WEBHOOK';

export const TELEMATICS_PROVIDERS: TelematicsProviderType[] = [
  'MANUAL',
  'TRACCAR',
  'SAMSARA',
  'GEOTAB',
  'GENERIC_WEBHOOK',
];

export interface TelematicsDevice {
  id: string;
  organizationId: string;
  name: string;
  provider: TelematicsProviderType;
  externalId: string;
  vehicleId: string | null;
  active: boolean;
  lastSeenAt: string | null;
  hasIngestSecret: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TelematicsDeviceCreated extends TelematicsDevice {
  ingestSecret: string;
  secretPrefix: string;
}

export interface RotateDeviceSecretResult {
  id: string;
  ingestSecret: string;
  secretPrefix: string;
}

export interface CreateTelematicsDeviceInput {
  name: string;
  provider: TelematicsProviderType;
  externalId: string;
  vehicleId?: string;
}

export interface UpdateTelematicsDeviceInput {
  name?: string;
  vehicleId?: string | null;
  active?: boolean;
}

export interface ListTelematicsDevicesParams {
  page?: number;
  limit?: number;
  search?: string;
  provider?: TelematicsProviderType;
  includeArchived?: boolean;
}

interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

class TelematicsDevicesAPI {
  private baseUrl = '/api';

  async list(
    params: ListTelematicsDevicesParams = {},
  ): Promise<{ items: TelematicsDevice[]; meta: PageMeta }> {
    const qs = new URLSearchParams();
    if (params.page != null) qs.set('page', String(params.page));
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.search) qs.set('search', params.search);
    if (params.provider) qs.set('provider', params.provider);
    if (params.includeArchived) qs.set('includeArchived', 'true');
    const res = await apiFetch(`${this.baseUrl}/telematics/devices?${qs}`, {
      method: 'GET',
    });
    const body = await unwrap<{ items: TelematicsDevice[]; meta: PageMeta }>(
      res,
      'Failed to load devices',
    );
    return {
      items: Array.isArray(body.items) ? body.items : [],
      meta: body.meta,
    };
  }

  async getById(id: string): Promise<TelematicsDevice> {
    const res = await apiFetch(`${this.baseUrl}/telematics/devices/${id}`, {
      method: 'GET',
    });
    return unwrap(res, 'Failed to load device');
  }

  async create(input: CreateTelematicsDeviceInput): Promise<TelematicsDeviceCreated> {
    const res = await apiFetch(`${this.baseUrl}/telematics/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return unwrap(res, 'Failed to create device');
  }

  async update(id: string, input: UpdateTelematicsDeviceInput): Promise<TelematicsDevice> {
    const res = await apiFetch(`${this.baseUrl}/telematics/devices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return unwrap(res, 'Failed to update device');
  }

  async rotateSecret(id: string): Promise<RotateDeviceSecretResult> {
    const res = await apiFetch(`${this.baseUrl}/telematics/devices/${id}/rotate-secret`, {
      method: 'POST',
    });
    return unwrap(res, 'Failed to rotate device secret');
  }

  async archive(id: string): Promise<TelematicsDevice> {
    const res = await apiFetch(`${this.baseUrl}/telematics/devices/${id}/archive`, {
      method: 'POST',
    });
    return unwrap(res, 'Failed to archive device');
  }

  async restore(id: string): Promise<TelematicsDevice> {
    const res = await apiFetch(`${this.baseUrl}/telematics/devices/${id}/restore`, {
      method: 'POST',
    });
    return unwrap(res, 'Failed to restore device');
  }
}

export const telematicsDevicesAPI = new TelematicsDevicesAPI();

export const telematicsDeviceKeys = {
  all: ['telematics-devices'] as const,
  list: (params: ListTelematicsDevicesParams) =>
    [...telematicsDeviceKeys.all, 'list', params] as const,
  detail: (id: string) => [...telematicsDeviceKeys.all, 'detail', id] as const,
};

export function useTelematicsDevicesList(
  params: ListTelematicsDevicesParams = {},
  opts?: { enabled?: boolean },
) {
  const result = useQuery({
    queryKey: telematicsDeviceKeys.list(params),
    queryFn: () => telematicsDevicesAPI.list(params),
    enabled: opts?.enabled ?? true,
  });
  return {
    ...result,
    items: result.data?.items ?? [],
    meta: result.data?.meta,
    errorMessage: result.error
      ? describeError(result.error, 'Failed to load devices')
      : null,
  };
}

export function useTelematicsDevice(id: string | null | undefined, opts?: { enabled?: boolean }) {
  const result = useQuery({
    queryKey: telematicsDeviceKeys.detail(id ?? ''),
    queryFn: () => telematicsDevicesAPI.getById(id!),
    enabled: (opts?.enabled ?? true) && !!id,
  });
  return {
    ...result,
    errorMessage: result.error
      ? describeError(result.error, 'Failed to load device')
      : null,
  };
}

function invalidateDevices(qc: ReturnType<typeof useQueryClient>, id?: string) {
  void qc.invalidateQueries({ queryKey: telematicsDeviceKeys.all });
  if (id) void qc.invalidateQueries({ queryKey: telematicsDeviceKeys.detail(id) });
}

export function useCreateTelematicsDeviceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTelematicsDeviceInput) => telematicsDevicesAPI.create(input),
    onSuccess: () => invalidateDevices(qc),
  });
}

export function useUpdateTelematicsDeviceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTelematicsDeviceInput }) =>
      telematicsDevicesAPI.update(id, input),
    onSuccess: (device) => invalidateDevices(qc, device.id),
  });
}

export function useRotateDeviceSecretMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => telematicsDevicesAPI.rotateSecret(id),
    onSuccess: (result) => invalidateDevices(qc, result.id),
  });
}

export function useArchiveTelematicsDeviceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => telematicsDevicesAPI.archive(id),
    onSuccess: (device) => invalidateDevices(qc, device.id),
  });
}

export function useRestoreTelematicsDeviceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => telematicsDevicesAPI.restore(id),
    onSuccess: (device) => invalidateDevices(qc, device.id),
  });
}
