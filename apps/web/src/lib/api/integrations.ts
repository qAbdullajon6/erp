import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './fetch';
import { unwrapResponse } from './error';
import type { IntegrationProviderInfo, IntegrationInstance, IntegrationOverallHealth, IntegrationLogEntry, IntegrationConnectInput, IntegrationSyncResult, IntegrationTestResult, IntegrationHealthStatus } from './integrations-types';

export const integrationKeys = {
  all: ['integrations'] as const,
  providers: () => [...integrationKeys.all, 'providers'] as const,
  list: (type?: string) => [...integrationKeys.all, 'list', { type }] as const,
  detail: (id: string) => [...integrationKeys.all, 'detail', id] as const,
  status: (id: string) => [...integrationKeys.all, 'status', id] as const,
  logs: (id: string) => [...integrationKeys.all, 'logs', id] as const,
  health: () => [...integrationKeys.all, 'health'] as const,
};

class IntegrationsAPI {
  async listProviders(): Promise<IntegrationProviderInfo[]> {
    const res = await apiFetch('/api/admin/integrations/providers', { method: 'GET' });
    return unwrapResponse(res, 'Failed to load providers');
  }

  async list(type?: string): Promise<IntegrationInstance[]> {
    const qs = type ? `?type=${type}` : '';
    const res = await apiFetch(`/api/admin/integrations${qs}`, { method: 'GET' });
    return unwrapResponse(res, 'Failed to load integrations');
  }

  async getById(id: string): Promise<IntegrationInstance> {
    const res = await apiFetch(`/api/admin/integrations/${id}`, { method: 'GET' });
    return unwrapResponse(res, 'Failed to load integration');
  }

  async getStatus(id: string): Promise<IntegrationHealthStatus> {
    const res = await apiFetch(`/api/admin/integrations/${id}/status`, { method: 'GET' });
    return unwrapResponse(res, 'Failed to load status');
  }

  async getLogs(id: string, limit = 50): Promise<IntegrationLogEntry[]> {
    const res = await apiFetch(`/api/admin/integrations/${id}/logs?limit=${limit}`, { method: 'GET' });
    return unwrapResponse(res, 'Failed to load logs');
  }

  async getHealth(): Promise<IntegrationOverallHealth> {
    const res = await apiFetch('/api/admin/integrations/health', { method: 'GET' });
    return unwrapResponse(res, 'Failed to load health');
  }

  async getSystemHealth(): Promise<{ registeredProviders: number; providerTypes: number; providers: Array<{ key: string; type: string; displayName: string }> }> {
    const res = await apiFetch('/api/admin/integrations/system-health', { method: 'GET' });
    return unwrapResponse(res, 'Failed to load system health');
  }

  async connect(input: IntegrationConnectInput): Promise<IntegrationInstance> {
    const res = await apiFetch('/api/admin/integrations/connect', { method: 'POST', body: JSON.stringify(input) });
    return unwrapResponse(res, 'Failed to connect integration');
  }

  async disconnect(id: string): Promise<void> {
    await apiFetch(`/api/admin/integrations/${id}/disconnect`, { method: 'POST' });
  }

  async sync(id: string): Promise<IntegrationSyncResult> {
    const res = await apiFetch(`/api/admin/integrations/${id}/sync`, { method: 'POST' });
    return unwrapResponse(res, 'Failed to sync integration');
  }

  async testConnection(id: string): Promise<IntegrationTestResult> {
    const res = await apiFetch(`/api/admin/integrations/${id}/test`, { method: 'POST' });
    return unwrapResponse(res, 'Failed to test connection');
  }

  async updateConfig(id: string, config: Record<string, unknown>): Promise<void> {
    await apiFetch(`/api/admin/integrations/${id}/config`, { method: 'PATCH', body: JSON.stringify({ config }) });
  }
}

export const integrationsAPI = new IntegrationsAPI();

export function useIntegrationProvidersQuery() {
  return useQuery({
    queryKey: integrationKeys.providers(),
    queryFn: () => integrationsAPI.listProviders(),
  });
}

export function useIntegrationsQuery(type?: string) {
  return useQuery({
    queryKey: integrationKeys.list(type),
    queryFn: () => integrationsAPI.list(type),
  });
}

export function useIntegrationQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: integrationKeys.detail(id),
    queryFn: () => integrationsAPI.getById(id),
    enabled: enabled && Boolean(id),
  });
}

export function useIntegrationStatusQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: integrationKeys.status(id),
    queryFn: () => integrationsAPI.getStatus(id),
    enabled: enabled && Boolean(id),
    refetchInterval: 30_000,
  });
}

export function useIntegrationLogsQuery(id: string, limit = 50, enabled = true) {
  return useQuery({
    queryKey: integrationKeys.logs(id),
    queryFn: () => integrationsAPI.getLogs(id, limit),
    enabled: enabled && Boolean(id),
  });
}

export function useIntegrationsHealthQuery() {
  return useQuery({
    queryKey: integrationKeys.health(),
    queryFn: () => integrationsAPI.getHealth(),
    refetchInterval: 30_000,
  });
}

export function useSystemHealthQuery() {
  return useQuery({
    queryKey: [...integrationKeys.all, 'system-health'],
    queryFn: () => integrationsAPI.getSystemHealth(),
  });
}

export function useConnectIntegrationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IntegrationConnectInput) => integrationsAPI.connect(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: integrationKeys.all }),
  });
}

export function useDisconnectIntegrationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => integrationsAPI.disconnect(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: integrationKeys.all }),
  });
}

export function useSyncIntegrationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => integrationsAPI.sync(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: integrationKeys.all });
      qc.invalidateQueries({ queryKey: integrationKeys.health() });
    },
  });
}

export function useTestIntegrationConnectionMutation() {
  return useMutation({
    mutationFn: (id: string) => integrationsAPI.testConnection(id),
  });
}

export function useUpdateIntegrationConfigMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, config }: { id: string; config: Record<string, unknown> }) => integrationsAPI.updateConfig(id, config),
    onSuccess: () => qc.invalidateQueries({ queryKey: integrationKeys.all }),
  });
}
