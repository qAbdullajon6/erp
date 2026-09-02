import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeError } from './describe-error';
import { unwrapResponse } from './error';
import { apiFetch } from './fetch';
import { driverKeys } from './query-keys';

export type DriverStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';
export type DriverLicenseClass = 'CLASS_A' | 'CLASS_B' | 'CLASS_C' | 'CLASS_D' | 'CLASS_E' | 'CE' | 'OTHER';
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACTOR';
export type WorkShift = 'DAY' | 'NIGHT' | 'FLEXIBLE';
export type DriverDocumentType = 'DRIVER_LICENSE' | 'PASSPORT_ID' | 'MEDICAL_CERTIFICATE' | 'ADR_CERTIFICATE' | 'BACKGROUND_CHECK' | 'OTHER';

export interface DriverEmergencyContact {
  id: string;
  driverId: string;
  name: string;
  relationship: string;
  phone: string;
  alternatePhone: string | null;
  email: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DriverDocument {
  id: string;
  driverId: string;
  organizationId: string;
  type: DriverDocumentType;
  documentNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  fileName: string | null;
  fileUrl: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Driver {
  id: string;
  organizationId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  status: DriverStatus;
  profilePhotoUrl: string | null;
  licenseNumber: string | null;
  licenseClass: DriverLicenseClass | null;
  licenseIssueDate: string | null;
  licenseExpiry: string | null;
  licenseEndorsements: string | null;
  employmentType: EmploymentType | null;
  hireDate: string | null;
  department: string | null;
  baseLocation: string | null;
  workShift: WorkShift | null;
  preferredRegions: string | null;
  availableDays: string[] | null;
  driverNotes: string | null;
  internalNotes: string | null;
  emergencyContact: DriverEmergencyContact | null;
  driverDocuments: DriverDocument[];
  /// Linked login account when an admin has attached a DRIVER-role user.
  userId?: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmergencyContactInput {
  name: string;
  relationship: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  address?: string;
}

export interface CreateDriverInput {
  employeeCode?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  profilePhotoUrl?: string;
  licenseNumber?: string;
  licenseClass?: DriverLicenseClass;
  licenseIssueDate?: string;
  licenseExpiry?: string;
  licenseEndorsements?: string;
  employmentType?: EmploymentType;
  hireDate?: string;
  department?: string;
  baseLocation?: string;
  workShift?: WorkShift;
  preferredRegions?: string;
  availableDays?: string[];
  driverNotes?: string;
  internalNotes?: string;
  emergencyContact?: CreateEmergencyContactInput;
}

export interface UpdateDriverInput {
  employeeCode?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  status?: DriverStatus;
  profilePhotoUrl?: string;
  licenseNumber?: string;
  licenseClass?: DriverLicenseClass;
  licenseIssueDate?: string;
  licenseExpiry?: string;
  licenseEndorsements?: string;
  employmentType?: EmploymentType;
  hireDate?: string;
  department?: string;
  baseLocation?: string;
  workShift?: WorkShift;
  preferredRegions?: string;
  availableDays?: string[];
  driverNotes?: string;
  internalNotes?: string;
  emergencyContact?: CreateEmergencyContactInput;
}

export interface ListDriversResponse {
  items: Driver[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListDriversParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: DriverStatus;
  includeArchived?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

class DriversAPI {
  async list(query: ListDriversParams = {}): Promise<ListDriversResponse> {
    const params = new URLSearchParams();
    if (query.page) params.append('page', String(query.page));
    if (query.limit) params.append('limit', String(query.limit));
    if (query.search) params.append('search', query.search);
    if (query.status) params.append('status', query.status);
    if (query.includeArchived) params.append('includeArchived', String(query.includeArchived));
    if (query.sortBy) params.append('sortBy', query.sortBy);
    if (query.sortOrder) params.append('sortOrder', query.sortOrder);

    const response = await apiFetch(
      `/api/drivers${params.size > 0 ? `?${params.toString()}` : ''}`,
      { method: 'GET' },
    );
    return unwrapResponse(response, 'Failed to fetch drivers');
  }

  async getById(id: string): Promise<Driver> {
    const response = await apiFetch(`/api/drivers/${id}`, { method: 'GET' });
    return unwrapResponse(response, 'Failed to fetch driver');
  }

  async create(input: CreateDriverInput): Promise<Driver> {
    const response = await apiFetch('/api/drivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return unwrapResponse(response, 'Failed to create driver');
  }

  async update(id: string, input: UpdateDriverInput): Promise<Driver> {
    const response = await apiFetch(`/api/drivers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return unwrapResponse(response, 'Failed to update driver');
  }

  async archive(id: string): Promise<Driver> {
    const response = await apiFetch(`/api/drivers/${id}/archive`, { method: 'POST' });
    return unwrapResponse(response, 'Failed to archive driver');
  }

  async restore(id: string): Promise<Driver> {
    const response = await apiFetch(`/api/drivers/${id}/restore`, { method: 'POST' });
    return unwrapResponse(response, 'Failed to restore driver');
  }

  async linkUser(id: string, userId: string): Promise<Driver> {
    const response = await apiFetch(`/api/drivers/${id}/link-user`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    return unwrapResponse(response, 'Failed to link driver login');
  }

  async unlinkUser(id: string): Promise<Driver> {
    const response = await apiFetch(`/api/drivers/${id}/unlink-user`, { method: 'POST' });
    return unwrapResponse(response, 'Failed to unlink driver login');
  }

  async uploadPhoto(id: string, file: File): Promise<Driver> {
    const form = new FormData();
    form.append('file', file);
    const response = await apiFetch(`/api/drivers/${id}/photo`, { method: 'POST', body: form });
    return unwrapResponse(response, 'Failed to upload driver photo');
  }

  async removePhoto(id: string): Promise<Driver> {
    const response = await apiFetch(`/api/drivers/${id}/photo`, { method: 'DELETE' });
    return unwrapResponse(response, 'Failed to remove driver photo');
  }
}

export const driversAPI = new DriversAPI();

function useInvalidateDrivers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: driverKeys.all });
}

/// Hooks — React Query (same contract as Customers/Orders). Mutations
/// invalidate `driverKeys` so list, detail, and expense pickers share one cache.

export function useDriversList(query: ListDriversParams = {}, options: { enabled?: boolean } = {}) {
  const result = useQuery({
    queryKey: driverKeys.list(query),
    queryFn: () => driversAPI.list(query),
    enabled: options.enabled ?? true,
  });

  return {
    data: result.data ?? null,
    items: result.data?.items ?? [],
    meta: result.data?.meta,
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to fetch drivers') : null,
    refetch: result.refetch,
  };
}

export function useDriver(id: string, options: { enabled?: boolean } = {}) {
  const result = useQuery({
    queryKey: driverKeys.detail(id),
    queryFn: () => driversAPI.getById(id),
    enabled: (options.enabled ?? true) && Boolean(id),
  });

  return {
    data: result.data ?? null,
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to fetch driver') : null,
    refetch: result.refetch,
  };
}

export function useCreateDriver() {
  const invalidate = useInvalidateDrivers();
  const mutation = useMutation({
    mutationFn: (input: CreateDriverInput) => driversAPI.create(input),
    onSuccess: invalidate,
  });

  return {
    mutate: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to create driver') : null,
  };
}

export function useUpdateDriver(id: string) {
  const invalidate = useInvalidateDrivers();
  const mutation = useMutation({
    mutationFn: (input: UpdateDriverInput) => driversAPI.update(id, input),
    onSuccess: invalidate,
  });

  return {
    mutate: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to update driver') : null,
  };
}

export function useArchiveDriver(id: string) {
  const invalidate = useInvalidateDrivers();
  const mutation = useMutation({
    mutationFn: () => driversAPI.archive(id),
    onSuccess: invalidate,
  });

  return {
    mutate: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to archive driver') : null,
  };
}

export function useRestoreDriver(id: string) {
  const invalidate = useInvalidateDrivers();
  const mutation = useMutation({
    mutationFn: () => driversAPI.restore(id),
    onSuccess: invalidate,
  });

  return {
    mutate: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to restore driver') : null,
  };
}

export function useLinkDriverUser(id: string) {
  const invalidate = useInvalidateDrivers();
  const mutation = useMutation({
    mutationFn: (userId: string) => driversAPI.linkUser(id, userId),
    onSuccess: invalidate,
  });

  return {
    mutate: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to link driver login') : null,
  };
}

export function useUnlinkDriverUser(id: string) {
  const invalidate = useInvalidateDrivers();
  const mutation = useMutation({
    mutationFn: () => driversAPI.unlinkUser(id),
    onSuccess: invalidate,
  });

  return {
    mutate: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to unlink driver login') : null,
  };
}

export function useUploadDriverPhoto(id: string) {
  const invalidate = useInvalidateDrivers();
  const mutation = useMutation({
    mutationFn: (file: File) => driversAPI.uploadPhoto(id, file),
    onSuccess: invalidate,
  });

  return {
    mutate: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to upload driver photo') : null,
  };
}

export function useRemoveDriverPhoto(id: string) {
  const invalidate = useInvalidateDrivers();
  const mutation = useMutation({
    mutationFn: () => driversAPI.removePhoto(id),
    onSuccess: invalidate,
  });

  return {
    mutate: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to remove driver photo') : null,
  };
}

/** Fetches an auth-gated image URL and returns a stable blob URL for use in <img> src. */
const _blobCache = new Map<string, string>();

export function useAuthenticatedPhotoSrc(url: string | null | undefined): string | null {
  const [src, setSrc] = React.useState<string | null>(() => (url ? (_blobCache.get(url) ?? null) : null));

  React.useEffect(() => {
    if (!url) { setSrc(null); return; }
    if (_blobCache.has(url)) { setSrc(_blobCache.get(url)!); return; }

    let cancelled = false;
    apiFetch(url, { method: 'GET' })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        _blobCache.set(url, objectUrl);
        setSrc(objectUrl);
      })
      .catch(() => { /* silently fall back to initials */ });

    return () => { cancelled = true; };
  }, [url]);

  return src;
}
