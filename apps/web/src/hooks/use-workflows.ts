'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workflowsAPI, type WorkflowConfig, type WorkflowExecutionListResponse } from '@/lib/api/workflows';
import { workflowKeys } from '@/lib/api/query-keys';

export function useWorkflowList(params?: { page?: number; limit?: number; active?: string }) {
  const result = useQuery({
    queryKey: workflowKeys.list(params),
    queryFn: () => workflowsAPI.list(params),
  });
  return {
    data: result.data?.items ?? [],
    meta: result.data?.meta ?? { page: 1, limit: 20, total: 0, totalPages: 0 },
    loading: result.isPending,
    error: result.error,
    refetch: result.refetch,
  };
}

export function useWorkflowDetail(id: string | null) {
  const result = useQuery({
    queryKey: workflowKeys.detail(id ?? ''),
    queryFn: () => workflowsAPI.getById(id!),
    enabled: !!id,
  });
  return {
    data: result.data ?? null,
    loading: result.isPending,
    error: result.error,
    refetch: result.refetch,
  };
}

export function useWorkflowTriggers() {
  const result = useQuery({
    queryKey: workflowKeys.triggers(),
    queryFn: () => workflowsAPI.getTriggers(),
  });
  return {
    data: result.data ?? [],
    loading: result.isPending,
    error: result.error,
  };
}

export function useWorkflowActions() {
  const result = useQuery({
    queryKey: workflowKeys.actions(),
    queryFn: () => workflowsAPI.getActions(),
  });
  return {
    data: result.data ?? [],
    loading: result.isPending,
    error: result.error,
  };
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string; config: WorkflowConfig; active?: boolean }) =>
      workflowsAPI.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
    },
  });
}

export function useUpdateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<{ name: string; description: string; config: WorkflowConfig; active: boolean }> }) =>
      workflowsAPI.update(id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
    },
  });
}

export function useToggleWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowsAPI.toggle(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
    },
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
    },
  });
}

export function useWorkflowExecutions(id: string | null, params?: { page?: number; limit?: number }) {
  const result = useQuery({
    queryKey: workflowKeys.executions(id ?? ''),
    queryFn: () => workflowsAPI.getExecutions(id!, params),
    enabled: !!id,
  });
  return {
    data: (result.data?.items ?? []) as WorkflowExecutionListResponse['items'],
    meta: result.data?.meta ?? { page: 1, limit: 20, total: 0, totalPages: 0 },
    loading: result.isPending,
    error: result.error,
    refetch: result.refetch,
  };
}
