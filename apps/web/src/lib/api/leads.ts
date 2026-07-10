import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './fetch';

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CLOSED';

/// The pipeline reads left to right, but a lead may be moved to any status:
/// a closed deal reopens, a lead contacted by mistake goes back to NEW.
export const LEAD_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED'];

export interface Lead {
  id: string;
  name: string;
  email: string;
  company: string;
  phone: string;
  message: string | null;
  source: string;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ListLeadsResponse {
  items: Lead[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ListLeadsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: LeadStatus;
  sortBy?: 'createdAt' | 'updatedAt' | 'company' | 'status';
  sortOrder?: 'asc' | 'desc';
}

/// Counts per status across the whole pipeline, so filtering to one status
/// does not hide how many sit in the others. Absent keys mean zero.
export type LeadStatusCounts = Partial<Record<LeadStatus, number>>;

async function unwrap<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body?.error?.message ?? body?.message ?? fallback;
    throw new Error(Array.isArray(message) ? message[0] : message);
  }
  const result = await response.json();
  return (result.data ?? result) as T;
}

class LeadsAPI {
  private baseUrl = '/api/leads';

  async list(params: ListLeadsParams = {}): Promise<ListLeadsResponse> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') search.set(key, String(value));
    }
    const query = search.toString();
    const response = await apiFetch(query ? `${this.baseUrl}?${query}` : this.baseUrl, { method: 'GET' });
    return unwrap<ListLeadsResponse>(response, 'Failed to load leads');
  }

  async stats(): Promise<LeadStatusCounts> {
    const response = await apiFetch(`${this.baseUrl}/stats`, { method: 'GET' });
    return unwrap<LeadStatusCounts>(response, 'Failed to load lead stats');
  }

  async updateStatus(id: string, status: LeadStatus): Promise<Lead> {
    const response = await apiFetch(`${this.baseUrl}/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return unwrap<Lead>(response, 'Failed to update lead status');
  }
}

export const leadsAPI = new LeadsAPI();

export const leadKeys = {
  all: ['leads'] as const,
  list: (params: ListLeadsParams) => [...leadKeys.all, 'list', params] as const,
  stats: () => [...leadKeys.all, 'stats'] as const,
};

export function useLeadsQuery(params: ListLeadsParams = {}) {
  return useQuery({
    queryKey: leadKeys.list(params),
    queryFn: () => leadsAPI.list(params),
  });
}

export function useLeadStatsQuery() {
  return useQuery({
    queryKey: leadKeys.stats(),
    queryFn: () => leadsAPI.stats(),
  });
}

export function useUpdateLeadStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) => leadsAPI.updateStatus(id, status),
    // The counters above the table move with the row, so both go stale.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadKeys.all }),
  });
}
