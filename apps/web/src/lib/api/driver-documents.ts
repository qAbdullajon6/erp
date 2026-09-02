import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeError } from './describe-error';
import { unwrapResponse } from './error';
import { apiFetch } from './fetch';
import { driverKeys } from './query-keys';
import type { DriverLicenseClass } from './drivers';

export type DocumentStatus =
  | 'MISSING'
  | 'VALID'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'PENDING_REVIEW'
  | 'REJECTED'
  | 'NOT_REQUIRED';

export type DriverDocumentType =
  | 'DRIVER_LICENSE'
  | 'PASSPORT_ID'
  | 'MEDICAL_CERTIFICATE'
  | 'ADR_CERTIFICATE'
  | 'BACKGROUND_CHECK'
  | 'OTHER';

export interface DriverDocumentRecord {
  id: string | null;
  organizationId: string;
  driverId: string;
  type: DriverDocumentType;
  status: DocumentStatus;
  documentNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  fileName: string | null;
  hasFile: boolean;
  mimeType: string | null;
  fileSizeBytes: number | null;
  licenseClass: DriverLicenseClass | null;
  endorsements: string | null;
  uploadedByUserId: string | null;
  verifiedAt: string | null;
  verifiedByUserId: string | null;
  rejectedAt: string | null;
  rejectedByUserId: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CreateDriverDocumentInput {
  type: DriverDocumentType;
  documentNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  licenseClass?: DriverLicenseClass;
  endorsements?: string;
  notes?: string;
}

export interface UpdateDriverDocumentInput {
  documentNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  licenseClass?: DriverLicenseClass;
  endorsements?: string;
  notes?: string;
}

export const DOC_TYPE_LABELS: Record<DriverDocumentType, string> = {
  DRIVER_LICENSE: 'Driver License',
  PASSPORT_ID: 'Passport / ID',
  MEDICAL_CERTIFICATE: 'Medical Certificate',
  ADR_CERTIFICATE: 'ADR Certificate',
  BACKGROUND_CHECK: 'Background Check',
  OTHER: 'Other Document',
};

export const DOC_STATUS_LABELS: Record<DocumentStatus, string> = {
  MISSING: 'Missing',
  VALID: 'Valid',
  EXPIRING_SOON: 'Expiring soon',
  EXPIRED: 'Expired',
  PENDING_REVIEW: 'Pending review',
  REJECTED: 'Rejected',
  NOT_REQUIRED: 'Not required',
};

const docKeys = {
  all: (driverId: string) => [...driverKeys.detail(driverId), 'documents'] as const,
};

class DriverDocumentsAPI {
  async list(driverId: string): Promise<{ items: DriverDocumentRecord[] }> {
    const res = await apiFetch(`/api/drivers/${driverId}/documents`, { method: 'GET' });
    return unwrapResponse(res, 'Failed to fetch driver documents');
  }

  async create(driverId: string, input: CreateDriverDocumentInput): Promise<DriverDocumentRecord> {
    const res = await apiFetch(`/api/drivers/${driverId}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return unwrapResponse(res, 'Failed to create document');
  }

  async update(driverId: string, docId: string, input: UpdateDriverDocumentInput): Promise<DriverDocumentRecord> {
    const res = await apiFetch(`/api/drivers/${driverId}/documents/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return unwrapResponse(res, 'Failed to update document');
  }

  async uploadFile(driverId: string, docId: string, file: File): Promise<DriverDocumentRecord> {
    const form = new FormData();
    form.append('file', file);
    const res = await apiFetch(`/api/drivers/${driverId}/documents/${docId}/file`, { method: 'POST', body: form });
    return unwrapResponse(res, 'Failed to upload file');
  }

  async removeFile(driverId: string, docId: string): Promise<DriverDocumentRecord> {
    const res = await apiFetch(`/api/drivers/${driverId}/documents/${docId}/file`, { method: 'DELETE' });
    return unwrapResponse(res, 'Failed to remove file');
  }

  async verify(driverId: string, docId: string): Promise<DriverDocumentRecord> {
    const res = await apiFetch(`/api/drivers/${driverId}/documents/${docId}/verify`, { method: 'POST' });
    return unwrapResponse(res, 'Failed to verify document');
  }

  async reject(driverId: string, docId: string, reason: string): Promise<DriverDocumentRecord> {
    const res = await apiFetch(`/api/drivers/${driverId}/documents/${docId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    return unwrapResponse(res, 'Failed to reject document');
  }

  async remove(driverId: string, docId: string): Promise<void> {
    const res = await apiFetch(`/api/drivers/${driverId}/documents/${docId}`, { method: 'DELETE' });
    await unwrapResponse(res, 'Failed to remove document');
  }
}

export const driverDocumentsAPI = new DriverDocumentsAPI();

function useInvalidateDocs(driverId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: docKeys.all(driverId) });
}

export function useDriverDocuments(driverId: string, opts: { enabled?: boolean } = {}) {
  const result = useQuery({
    queryKey: docKeys.all(driverId),
    queryFn: () => driverDocumentsAPI.list(driverId),
    enabled: (opts.enabled ?? true) && Boolean(driverId),
  });
  return {
    items: result.data?.items ?? [],
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to load documents') : null,
    refetch: result.refetch,
  };
}

export function useCreateDriverDocument(driverId: string) {
  const invalidate = useInvalidateDocs(driverId);
  const mutation = useMutation({
    mutationFn: (input: CreateDriverDocumentInput) => driverDocumentsAPI.create(driverId, input),
    onSuccess: invalidate,
  });
  return { mutate: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error ? describeError(mutation.error) : null };
}

export function useUpdateDriverDocument(driverId: string) {
  const invalidate = useInvalidateDocs(driverId);
  const mutation = useMutation({
    mutationFn: ({ docId, input }: { docId: string; input: UpdateDriverDocumentInput }) =>
      driverDocumentsAPI.update(driverId, docId, input),
    onSuccess: invalidate,
  });
  return { mutate: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error ? describeError(mutation.error) : null };
}

export function useUploadDriverDocumentFile(driverId: string) {
  const invalidate = useInvalidateDocs(driverId);
  const mutation = useMutation({
    mutationFn: ({ docId, file }: { docId: string; file: File }) => driverDocumentsAPI.uploadFile(driverId, docId, file),
    onSuccess: invalidate,
  });
  return { mutate: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error ? describeError(mutation.error) : null };
}

export function useRemoveDriverDocumentFile(driverId: string) {
  const invalidate = useInvalidateDocs(driverId);
  const mutation = useMutation({
    mutationFn: (docId: string) => driverDocumentsAPI.removeFile(driverId, docId),
    onSuccess: invalidate,
  });
  return { mutate: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error ? describeError(mutation.error) : null };
}

export function useVerifyDriverDocument(driverId: string) {
  const invalidate = useInvalidateDocs(driverId);
  const mutation = useMutation({
    mutationFn: (docId: string) => driverDocumentsAPI.verify(driverId, docId),
    onSuccess: invalidate,
  });
  return { mutate: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error ? describeError(mutation.error) : null };
}

export function useRejectDriverDocument(driverId: string) {
  const invalidate = useInvalidateDocs(driverId);
  const mutation = useMutation({
    mutationFn: ({ docId, reason }: { docId: string; reason: string }) => driverDocumentsAPI.reject(driverId, docId, reason),
    onSuccess: invalidate,
  });
  return { mutate: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error ? describeError(mutation.error) : null };
}

export function useRemoveDriverDocument(driverId: string) {
  const invalidate = useInvalidateDocs(driverId);
  const mutation = useMutation({
    mutationFn: (docId: string) => driverDocumentsAPI.remove(driverId, docId),
    onSuccess: invalidate,
  });
  return { mutate: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error ? describeError(mutation.error) : null };
}

/** Fetch a document file behind auth and return a blob URL. Cached per docId. */
const _docBlobCache = new Map<string, string>();
export function useDriverDocumentFileSrc(driverId: string, docId: string | null, hasFile: boolean): string | null {
  const [src, setSrc] = React.useState<string | null>(() =>
    docId && hasFile ? (_docBlobCache.get(docId) ?? null) : null,
  );

  React.useEffect(() => {
    if (!docId || !hasFile) { setSrc(null); return; }
    if (_docBlobCache.has(docId)) { setSrc(_docBlobCache.get(docId)!); return; }

    let cancelled = false;
    apiFetch(`/api/drivers/${driverId}/documents/${docId}/file`, { method: 'GET' })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!blob || cancelled) return;
        const url = URL.createObjectURL(blob);
        _docBlobCache.set(docId, url);
        setSrc(url);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [driverId, docId, hasFile]);

  return src;
}
