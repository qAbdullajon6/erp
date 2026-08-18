import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './fetch';
import { unwrapResponse } from './error';

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CLOSED';

/// The pipeline reads left to right, but a lead may be moved to any status:
/// a closed deal reopens, a lead contacted by mistake goes back to NEW.
export const LEAD_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED'];

export const LEAD_STATUS_DESCRIPTIONS: Record<LeadStatus, string> = {
  NEW: 'Customer just submitted a demo request.',
  CONTACTED: 'Sales contacted the customer.',
  QUALIFIED: 'Ready for conversion to an organization.',
  CLOSED: 'Won (converted) or lost — pipeline complete.',
};

export interface LeadTimelineEvent {
  id: string;
  leadId: string;
  type: string;
  title: string;
  body: string | null;
  metadata?: Record<string, unknown> | null;
  actorUserId: string | null;
  createdAt: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  company: string;
  phone: string;
  message: string | null;
  source: string;
  status: LeadStatus;
  convertedOrganizationId?: string | null;
  convertedInvitationId?: string | null;
  createdAt: string;
  updatedAt: string;
  timelineEvents?: LeadTimelineEvent[];
  convertedOrganization?: {
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null;
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

const unwrap = unwrapResponse;

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

  async getById(id: string): Promise<Lead> {
    const response = await apiFetch(`${this.baseUrl}/${id}`, { method: 'GET' });
    return unwrap<Lead>(response, 'Failed to load lead');
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
  detail: (id: string) => [...leadKeys.all, 'detail', id] as const,
  stats: () => [...leadKeys.all, 'stats'] as const,
};

/// `enabled` lets the screen hold the request until it knows the viewer is
/// platform staff, rather than firing one it knows will come back 403.
export function useLeadsQuery(params: ListLeadsParams = {}, enabled = true) {
  return useQuery({
    queryKey: leadKeys.list(params),
    queryFn: () => leadsAPI.list(params),
    enabled,
  });
}

export function useLeadQuery(id: string | null, enabled = true) {
  return useQuery({
    queryKey: leadKeys.detail(id ?? ''),
    queryFn: () => leadsAPI.getById(id!),
    enabled: enabled && Boolean(id),
  });
}

export function useLeadStatsQuery(enabled = true) {
  return useQuery({
    queryKey: leadKeys.stats(),
    queryFn: () => leadsAPI.stats(),
    enabled,
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
