import { apiFetch } from './fetch';
import { unwrapResponse } from './error';

export type ImportStatus =
  | 'PENDING'
  | 'VALIDATING'
  | 'VALIDATED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type DuplicateStrategy = 'SKIP' | 'UPDATE' | 'ERROR';

export interface ValidationError {
  row: number;
  column: string;
  message: string;
  value?: string;
  severity?: 'ERROR' | 'WARNING';
}

/// Column index -> entity field name. Indices are strings because they are JSON
/// object keys on the wire.
export type ColumnMapping = Record<string, string>;

export interface ImportSession {
  id: string;
  organizationId: string;
  uploadedBy: string;
  entityType: string;
  status: ImportStatus;
  fileName: string;
  format: string;
  duplicateStrategy: DuplicateStrategy;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  processedRows: number;
  successfulRows: number;
  updatedRows: number;
  failedRows: number;
  skippedRows: number;
  errorMessage: string | null;
  cancelRequested: boolean;
  headers: string[];
  columnMapping: ColumnMapping | null;
  /// Wall-clock duration of the execution phase, milliseconds. Null until done.
  executionMs: number | null;
  validationErrors: ValidationError[] | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ColumnDefinition {
  fieldName: string;
  label: string;
  required: boolean;
  type: string;
  example: string;
  enumValues: string[] | null;
}

export interface MappingTemplate {
  id: string;
  name: string;
  entityType: string;
  /// Keyed by source HEADER, so a template survives a file whose columns moved.
  mapping: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ParseResult {
  sessionId: string;
  entityType: string;
  headers: string[];
  totalRows: number;
  preview: Record<string, unknown>[];
  columnDefinitions: ColumnDefinition[];
  defaultMapping: ColumnMapping;
  savedTemplates: MappingTemplate[];
}

export interface MappingValidation {
  ok: boolean;
  missingRequired: string[];
  unmappedColumns: string[];
  duplicateTargets: string[];
}

export interface ValidateResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warnings: number;
  duplicates: number;
  newRecords: number;
  updates: number;
  ignoredColumns: string[];
  estimatedSeconds: number;
  errors: ValidationError[];
  preview: { valid: Record<string, unknown>[]; invalid: Record<string, unknown>[] };
}

export interface ImportEntity {
  entityType: string;
  label: string;
  fields: ColumnDefinition[];
}

export interface ImportListResponse {
  items: ImportSession[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

class ImportsAPI {
  private baseUrl = '/api/import';

  /// The entity types THIS user may import — the server filters by role, so a
  /// dropdown built from this never offers an option that 403s on upload.
  async listEntities(): Promise<{ items: ImportEntity[] }> {
    const response = await apiFetch(`${this.baseUrl}/entities`);
    return unwrapResponse<{ items: ImportEntity[] }>(response, 'Failed to load import types');
  }

  async parseFile(file: File, entityType: string): Promise<ParseResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', entityType);
    const response = await apiFetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      body: formData,
    });
    return unwrapResponse<ParseResult>(response, 'Failed to upload file');
  }

  /// Persists the confirmed column mapping. Must run before validate — the
  /// server validates against the SAVED mapping, not one passed inline.
  async saveMapping(sessionId: string, columnMapping: ColumnMapping): Promise<MappingValidation> {
    const response = await apiFetch(`${this.baseUrl}/sessions/${sessionId}/mapping`, {
      method: 'PUT',
      body: JSON.stringify({ columnMapping }),
    });
    return unwrapResponse<MappingValidation>(response, 'Failed to save column mapping');
  }

  async saveMappingTemplate(
    sessionId: string,
    name: string,
    columnMapping: ColumnMapping,
  ): Promise<{ id: string; name: string }> {
    const response = await apiFetch(`${this.baseUrl}/sessions/${sessionId}/mapping/save-template`, {
      method: 'POST',
      body: JSON.stringify({ name, columnMapping }),
    });
    return unwrapResponse<{ id: string; name: string }>(response, 'Failed to save mapping template');
  }

  async validate(sessionId: string): Promise<ValidateResult> {
    const response = await apiFetch(`${this.baseUrl}/sessions/${sessionId}/validate`, {
      method: 'POST',
    });
    return unwrapResponse<ValidateResult>(response, 'Failed to validate import');
  }

  /// Returns as soon as the import is ACCEPTED (status EXECUTING), not when it
  /// finishes — poll getById for progress.
  async execute(sessionId: string, duplicateStrategy: DuplicateStrategy): Promise<ImportSession> {
    const response = await apiFetch(`${this.baseUrl}/sessions/${sessionId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ duplicateStrategy }),
    });
    return unwrapResponse<ImportSession>(response, 'Failed to execute import');
  }

  async cancel(sessionId: string): Promise<ImportSession> {
    const response = await apiFetch(`${this.baseUrl}/sessions/${sessionId}/cancel`, {
      method: 'POST',
    });
    return unwrapResponse<ImportSession>(response, 'Failed to cancel import');
  }

  async resume(sessionId: string): Promise<ImportSession> {
    const response = await apiFetch(`${this.baseUrl}/sessions/${sessionId}/resume`, {
      method: 'POST',
    });
    return unwrapResponse<ImportSession>(response, 'Failed to resume import');
  }

  async retryFailed(sessionId: string): Promise<ImportSession & { retriedRows: number }> {
    const response = await apiFetch(`${this.baseUrl}/sessions/${sessionId}/retry`, {
      method: 'POST',
    });
    return unwrapResponse<ImportSession & { retriedRows: number }>(
      response,
      'Failed to retry failed rows',
    );
  }

  async getById(sessionId: string): Promise<ImportSession> {
    const response = await apiFetch(`${this.baseUrl}/sessions/${sessionId}`);
    return unwrapResponse<ImportSession>(response, 'Failed to load import session');
  }

  async list(params?: {
    page?: number;
    limit?: number;
    entityType?: string;
    status?: string;
  }): Promise<ImportListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.entityType) searchParams.set('entityType', params.entityType);
    if (params?.status) searchParams.set('status', params.status);
    const qs = searchParams.toString();
    const response = await apiFetch(`${this.baseUrl}/sessions${qs ? `?${qs}` : ''}`);
    return unwrapResponse<ImportListResponse>(response, 'Failed to load import history');
  }

  /// These two return a file, not JSON — the routes are marked @RawResponse()
  /// server-side so the CSV is not wrapped in the { data: ... } envelope.
  async downloadErrors(sessionId: string): Promise<Blob> {
    const response = await apiFetch(`${this.baseUrl}/sessions/${sessionId}/errors`);
    if (!response.ok) throw new Error('Failed to download error report');
    return response.blob();
  }

  async downloadTemplate(entityType: string): Promise<Blob> {
    const response = await apiFetch(`${this.baseUrl}/sessions/template/${entityType}`);
    if (!response.ok) throw new Error('Failed to download template');
    return response.blob();
  }
}

export const importsAPI = new ImportsAPI();

/// Saves a Blob to disk. Shared by the template and error-report downloads,
/// which were duplicating the object-URL dance (and one of them leaked it).
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
