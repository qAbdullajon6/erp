import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './fetch';
import { unwrapResponse as unwrap } from './error';
import { describeError } from './describe-error';
import type { GeofenceEventItem, GeofenceEventType } from './telematics';

/// Client for `/telematics/geofences` CRUD + events.
/// Read: ADMIN / OPERATIONS_MANAGER / DISPATCHER
/// Write (create/update/archive/restore): ADMIN / OPERATIONS_MANAGER

export type GeofenceType = 'CIRCLE' | 'POLYGON';

export interface GeofenceVertex {
  lat: number;
  lng: number;
}

export interface Geofence {
  id: string;
  organizationId: string;
  name: string;
  type: GeofenceType;
  active: boolean;
  centerLat: number | null;
  centerLng: number | null;
  radiusM: number | null;
  polygon: GeofenceVertex[] | null;
  color: string | null;
  category: string | null;
  linkedCustomerId: string | null;
  alertOnEnter: boolean;
  alertOnExit: boolean;
  dwellThresholdSec: number | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGeofenceInput {
  name: string;
  type: GeofenceType;
  active?: boolean;
  centerLat?: number;
  centerLng?: number;
  radiusM?: number;
  polygon?: GeofenceVertex[];
  color?: string;
  category?: string;
  linkedCustomerId?: string;
  alertOnEnter?: boolean;
  alertOnExit?: boolean;
  dwellThresholdSec?: number;
}

export type UpdateGeofenceInput = Partial<CreateGeofenceInput>;

export interface ListGeofencesParams {
  page?: number;
  limit?: number;
  search?: string;
  active?: boolean;
  includeArchived?: boolean;
}

export interface ListGeofenceEventsParams {
  page?: number;
  limit?: number;
  geofenceId?: string;
  vehicleId?: string;
  type?: GeofenceEventType;
  from?: string;
  to?: string;
}

interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function normalizePolygon(value: unknown): GeofenceVertex[] | null {
  if (!Array.isArray(value)) return null;
  const vertices = value
    .map((v) => {
      if (!v || typeof v !== 'object') return null;
      const lat = Number((v as { lat?: unknown }).lat);
      const lng = Number((v as { lng?: unknown }).lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    })
    .filter((v): v is GeofenceVertex => v != null);
  return vertices.length >= 3 ? vertices : null;
}

function normalizeGeofence(raw: Geofence): Geofence {
  return {
    ...raw,
    polygon: normalizePolygon(raw.polygon),
  };
}

class TelematicsGeofencesAPI {
  private baseUrl = '/api';

  async list(
    params: ListGeofencesParams = {},
  ): Promise<{ items: Geofence[]; meta: PageMeta }> {
    const qs = new URLSearchParams();
    if (params.page != null) qs.set('page', String(params.page));
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.search) qs.set('search', params.search);
    if (params.active !== undefined) qs.set('active', String(params.active));
    if (params.includeArchived) qs.set('includeArchived', 'true');
    const res = await apiFetch(`${this.baseUrl}/telematics/geofences?${qs}`, {
      method: 'GET',
    });
    const body = await unwrap<{ items: Geofence[]; meta: PageMeta }>(
      res,
      'Failed to load geofences',
    );
    return {
      items: Array.isArray(body.items)
        ? body.items.map(normalizeGeofence)
        : [],
      meta: body.meta,
    };
  }

  async getById(id: string): Promise<Geofence> {
    const res = await apiFetch(`${this.baseUrl}/telematics/geofences/${id}`, {
      method: 'GET',
    });
    return normalizeGeofence(await unwrap(res, 'Failed to load geofence'));
  }

  async create(input: CreateGeofenceInput): Promise<Geofence> {
    const res = await apiFetch(`${this.baseUrl}/telematics/geofences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return normalizeGeofence(await unwrap(res, 'Failed to create geofence'));
  }

  async update(id: string, input: UpdateGeofenceInput): Promise<Geofence> {
    const res = await apiFetch(`${this.baseUrl}/telematics/geofences/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return normalizeGeofence(await unwrap(res, 'Failed to update geofence'));
  }

  async archive(id: string): Promise<Geofence> {
    const res = await apiFetch(
      `${this.baseUrl}/telematics/geofences/${id}/archive`,
      { method: 'POST' },
    );
    return normalizeGeofence(await unwrap(res, 'Failed to archive geofence'));
  }

  async restore(id: string): Promise<Geofence> {
    const res = await apiFetch(
      `${this.baseUrl}/telematics/geofences/${id}/restore`,
      { method: 'POST' },
    );
    return normalizeGeofence(await unwrap(res, 'Failed to restore geofence'));
  }

  async listEvents(
    params: ListGeofenceEventsParams = {},
  ): Promise<{ items: GeofenceEventItem[]; meta: PageMeta }> {
    const qs = new URLSearchParams();
    if (params.page != null) qs.set('page', String(params.page));
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.geofenceId) qs.set('geofenceId', params.geofenceId);
    if (params.vehicleId) qs.set('vehicleId', params.vehicleId);
    if (params.type) qs.set('type', params.type);
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    const res = await apiFetch(
      `${this.baseUrl}/telematics/geofences/events?${qs}`,
      { method: 'GET' },
    );
    const body = await unwrap<{ items: GeofenceEventItem[]; meta: PageMeta }>(
      res,
      'Failed to load geofence events',
    );
    return {
      items: Array.isArray(body.items) ? body.items : [],
      meta: body.meta,
    };
  }
}

export const telematicsGeofencesAPI = new TelematicsGeofencesAPI();

export const geofenceKeys = {
  all: ['telematics-geofences'] as const,
  list: (params: ListGeofencesParams) =>
    [...geofenceKeys.all, 'list', params] as const,
  detail: (id: string) => [...geofenceKeys.all, 'detail', id] as const,
  events: (params: ListGeofenceEventsParams) =>
    [...geofenceKeys.all, 'events', params] as const,
};

function invalidateGeofences(qc: ReturnType<typeof useQueryClient>, id?: string) {
  void qc.invalidateQueries({ queryKey: geofenceKeys.all });
  if (id) void qc.invalidateQueries({ queryKey: geofenceKeys.detail(id) });
}

export function useGeofencesList(
  params: ListGeofencesParams = {},
  opts?: { enabled?: boolean },
) {
  const result = useQuery({
    queryKey: geofenceKeys.list(params),
    queryFn: () => telematicsGeofencesAPI.list(params),
    enabled: opts?.enabled ?? true,
  });
  return {
    ...result,
    items: result.data?.items ?? [],
    meta: result.data?.meta,
    errorMessage: result.error
      ? describeError(result.error, 'Failed to load geofences')
      : null,
  };
}

export function useGeofence(id?: string | null, opts?: { enabled?: boolean }) {
  const result = useQuery({
    queryKey: geofenceKeys.detail(id ?? ''),
    queryFn: () => telematicsGeofencesAPI.getById(id!),
    enabled: (opts?.enabled ?? true) && !!id,
  });
  return {
    ...result,
    errorMessage: result.error
      ? describeError(result.error, 'Failed to load geofence')
      : null,
  };
}

export function useGeofenceEventsList(
  params: ListGeofenceEventsParams = {},
  opts?: { enabled?: boolean },
) {
  const queryParams = {
    page: params.page ?? 1,
    limit: params.limit ?? 40,
    geofenceId: params.geofenceId,
    vehicleId: params.vehicleId,
    type: params.type,
    from: params.from,
    to: params.to,
  };
  const result = useQuery({
    queryKey: geofenceKeys.events(queryParams),
    queryFn: () => telematicsGeofencesAPI.listEvents(queryParams),
    enabled: opts?.enabled ?? true,
    refetchOnReconnect: true,
  });
  return {
    ...result,
    items: result.data?.items ?? [],
    meta: result.data?.meta,
    errorMessage: result.error
      ? describeError(result.error, 'Failed to load geofence events')
      : null,
  };
}

export function useCreateGeofenceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGeofenceInput) =>
      telematicsGeofencesAPI.create(input),
    onSuccess: () => invalidateGeofences(qc),
  });
}

export function useUpdateGeofenceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateGeofenceInput }) =>
      telematicsGeofencesAPI.update(id, input),
    onSuccess: (fence) => invalidateGeofences(qc, fence.id),
  });
}

export function useArchiveGeofenceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => telematicsGeofencesAPI.archive(id),
    onSuccess: (fence) => invalidateGeofences(qc, fence.id),
  });
}

export function useRestoreGeofenceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => telematicsGeofencesAPI.restore(id),
    onSuccess: (fence) => invalidateGeofences(qc, fence.id),
  });
}
