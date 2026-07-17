import { apiFetch } from './fetch';
import { unwrapResponse } from './error';

export type WorkflowStatus = 'PENDING' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

export interface WorkflowTriggerDef {
  type: string;
  displayName: string;
  description: string;
}

export interface WorkflowActionDef {
  type: string;
  displayName: string;
  description: string;
}

export interface WorkflowCondition {
  field: string;
  operator: string;
  value: unknown;
}

export interface WorkflowConditionGroup {
  operator: 'AND' | 'OR';
  conditions: (WorkflowCondition | WorkflowConditionGroup)[];
}

export interface WorkflowActionConfig {
  type: string;
  config: Record<string, unknown>;
}

export interface WorkflowConfig {
  trigger: {
    event: string;
    filters?: Record<string, unknown>;
  };
  conditions?: WorkflowConditionGroup;
  actions: WorkflowActionConfig[];
}

export interface Workflow {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  config: WorkflowConfig;
  active: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  organizationId: string;
  trigger: string;
  eventPayload: Record<string, unknown> | null;
  status: WorkflowStatus;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  logs?: WorkflowExecutionLog[];
}

export interface WorkflowExecutionLog {
  id: string;
  executionId: string;
  step: string;
  status: string;
  message: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface WorkflowListResponse {
  items: Workflow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface WorkflowExecutionListResponse {
  items: WorkflowExecution[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

class WorkflowsAPI {
  private baseUrl = '/api/workflows';

  async list(params?: { page?: number; limit?: number; active?: string }): Promise<WorkflowListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.active) searchParams.set('active', params.active);
    const qs = searchParams.toString();
    const response = await apiFetch(`${this.baseUrl}${qs ? `?${qs}` : ''}`);
    return unwrapResponse<WorkflowListResponse>(response, 'Failed to load workflows');
  }

  async getById(id: string): Promise<Workflow> {
    const response = await apiFetch(`${this.baseUrl}/${id}`);
    return unwrapResponse<Workflow>(response, 'Failed to load workflow');
  }

  async create(input: { name: string; description?: string; config: WorkflowConfig; active?: boolean }): Promise<Workflow> {
    const response = await apiFetch(this.baseUrl, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return unwrapResponse<Workflow>(response, 'Failed to create workflow');
  }

  async update(id: string, input: Partial<{ name: string; description: string; config: WorkflowConfig; active: boolean }>): Promise<Workflow> {
    const response = await apiFetch(`${this.baseUrl}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return unwrapResponse<Workflow>(response, 'Failed to update workflow');
  }

  async delete(id: string): Promise<void> {
    const response = await apiFetch(`${this.baseUrl}/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      await unwrapResponse(response, 'Failed to delete workflow');
    }
  }

  async toggle(id: string): Promise<Workflow> {
    const response = await apiFetch(`${this.baseUrl}/${id}/toggle`, { method: 'POST' });
    return unwrapResponse<Workflow>(response, 'Failed to toggle workflow');
  }

  async getTriggers(): Promise<WorkflowTriggerDef[]> {
    const response = await apiFetch(`${this.baseUrl}/triggers`);
    return unwrapResponse<WorkflowTriggerDef[]>(response, 'Failed to load triggers');
  }

  async getActions(): Promise<WorkflowActionDef[]> {
    const response = await apiFetch(`${this.baseUrl}/actions`);
    return unwrapResponse<WorkflowActionDef[]>(response, 'Failed to load actions');
  }

  async getExecutions(id: string, params?: { page?: number; limit?: number }): Promise<WorkflowExecutionListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const qs = searchParams.toString();
    const response = await apiFetch(`${this.baseUrl}/${id}/executions${qs ? `?${qs}` : ''}`);
    return unwrapResponse<WorkflowExecutionListResponse>(response, 'Failed to load executions');
  }
}

export const workflowsAPI = new WorkflowsAPI();
