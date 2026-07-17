'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { importsAPI, type ColumnMapping, type DuplicateStrategy } from '@/lib/api/imports';
import { importKeys } from '@/lib/api/query-keys';

export function useImportEntities() {
  return useQuery({
    queryKey: [...importKeys.all, 'entities'],
    queryFn: () => importsAPI.listEntities(),
    // The importable set changes only on deploy (and with the user's role),
    // so refetching it per mount is pure waste.
    staleTime: Infinity,
  });
}

export function useImportHistory(params?: {
  page?: number;
  limit?: number;
  entityType?: string;
  status?: string;
}) {
  const result = useQuery({
    queryKey: importKeys.list(params),
    queryFn: () => importsAPI.list(params),
  });
  return {
    data: result.data?.items ?? [],
    meta: result.data?.meta ?? { page: 1, limit: 20, total: 0, totalPages: 0 },
    loading: result.isPending,
    error: result.error,
    refetch: result.refetch,
  };
}

export function useImportDetail(sessionId: string | null) {
  const result = useQuery({
    queryKey: importKeys.detail(sessionId ?? ''),
    queryFn: () => importsAPI.getById(sessionId!),
    enabled: !!sessionId,
    // Execution is asynchronous by design, so the only way to see progress is
    // to poll — but only while there is progress to see.
    refetchInterval: (query: { state: { data?: { status?: string } } }) => {
      const status = query.state.data?.status;
      if (status === 'EXECUTING' || status === 'VALIDATING') return 1000;
      return false;
    },
  });
  return {
    data: result.data ?? null,
    loading: result.isPending,
    error: result.error,
    refetch: result.refetch,
  };
}

export function useParseImport() {
  return useMutation({
    mutationFn: ({ file, entityType }: { file: File; entityType: string }) =>
      importsAPI.parseFile(file, entityType),
  });
}

export function useSaveMapping() {
  return useMutation({
    mutationFn: ({ sessionId, columnMapping }: { sessionId: string; columnMapping: ColumnMapping }) =>
      importsAPI.saveMapping(sessionId, columnMapping),
  });
}

export function useSaveMappingTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId, name, columnMapping,
    }: { sessionId: string; name: string; columnMapping: ColumnMapping }) =>
      importsAPI.saveMappingTemplate(sessionId, name, columnMapping),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: importKeys.all }),
  });
}

export function useValidateImport() {
  return useMutation({
    mutationFn: (sessionId: string) => importsAPI.validate(sessionId),
  });
}

export function useExecuteImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, duplicateStrategy }: { sessionId: string; duplicateStrategy: DuplicateStrategy }) =>
      importsAPI.execute(sessionId, duplicateStrategy),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: importKeys.all });
    },
  });
}

/// The three lifecycle actions all mutate one session and belong in both the
/// detail view and the history list, so each invalidates both.
function useSessionAction<T>(fn: (sessionId: string) => Promise<T>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_data, sessionId) => {
      void queryClient.invalidateQueries({ queryKey: importKeys.detail(sessionId) });
      void queryClient.invalidateQueries({ queryKey: importKeys.all });
    },
  });
}

export function useCancelImport() {
  return useSessionAction((sessionId) => importsAPI.cancel(sessionId));
}

export function useResumeImport() {
  return useSessionAction((sessionId) => importsAPI.resume(sessionId));
}

export function useRetryImport() {
  return useSessionAction((sessionId) => importsAPI.retryFailed(sessionId));
}
