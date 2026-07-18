import { useState, useCallback, useEffect } from "react";
import { unwrapResponse } from "./error";
import { apiFetch } from "./fetch";

export interface AuditLogActor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface AuditLogEntry {
  id: string;
  organizationId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  actor: AuditLogActor | null;
}

export interface AuditLogListResponse {
  items: AuditLogEntry[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListAuditLogsParams {
  page?: number;
  limit?: number;
  search?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  sortBy?: "createdAt" | "action" | "entityType";
  sortOrder?: "asc" | "desc";
}

class AuditLogsAPI {
  private baseUrl = "/api";

  async list(params?: ListAuditLogsParams): Promise<AuditLogListResponse> {
    try {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set("page", String(params.page));
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.search) searchParams.set("search", params.search);
      if (params?.action) searchParams.set("action", params.action);
      if (params?.entityType) searchParams.set("entityType", params.entityType);
      if (params?.entityId) searchParams.set("entityId", params.entityId);
      if (params?.actorUserId) searchParams.set("actorUserId", params.actorUserId);
      if (params?.from) searchParams.set("from", params.from);
      if (params?.to) searchParams.set("to", params.to);
      if (params?.sortBy) searchParams.set("sortBy", params.sortBy);
      if (params?.sortOrder) searchParams.set("sortOrder", params.sortOrder);

      const url = `${this.baseUrl}/audit${searchParams.toString() ? `?${searchParams}` : ""}`;
      const response = await apiFetch(url, { method: "GET" });
      return unwrapResponse(response, "Failed to fetch audit logs");
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      throw error;
    }
  }

  async getById(id: string): Promise<AuditLogEntry> {
    try {
      const response = await apiFetch(`${this.baseUrl}/audit/${id}`, { method: "GET" });
      return unwrapResponse(response, "Failed to fetch audit log entry");
    } catch (error) {
      console.error("Error fetching audit log entry:", error);
      throw error;
    }
  }
}

export const auditLogsAPI = new AuditLogsAPI();

export function useAuditLogsList(initialParams?: ListAuditLogsParams) {
  const [data, setData] = useState<AuditLogEntry[]>([]);
  const [meta, setMeta] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(
    async (params?: ListAuditLogsParams) => {
      setLoading(true);
      setError(null);
      try {
        const result = await auditLogsAPI.list(params || initialParams);
        setData(result.items);
        setMeta(result.meta);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load audit logs");
        setData([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (initialParams) {
      fetch(initialParams);
    }
  }, [JSON.stringify(initialParams), fetch]);

  return { data, meta, loading, error, refetch: fetch, fetch };
}

export function useAuditLogDetail(id: string | null) {
  const [data, setData] = useState<AuditLogEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await auditLogsAPI.getById(id);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit log entry");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) fetch();
    else setData(null);
  }, [id, fetch]);

  return { data, loading, error, refetch: fetch };
}
