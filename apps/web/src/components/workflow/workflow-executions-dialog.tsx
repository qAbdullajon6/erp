'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { LoadingState, ErrorState } from '@/components/shared/list-states';
import { useWorkflowExecutions } from '@/hooks/use-workflows';
import type { WorkflowExecution } from '@/lib/api/workflows';
import { History } from 'lucide-react';

export function WorkflowExecutionsDialog({
  workflowId,
  onClose,
}: {
  workflowId: string | null;
  onClose: () => void;
}) {
  const { data, loading, error, refetch } = useWorkflowExecutions(workflowId, { limit: 20 });

  return (
    <Dialog open={!!workflowId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-brand" />
            Execution History
          </DialogTitle>
          <DialogDescription>
            Recent times this workflow ran automatically.
          </DialogDescription>
        </DialogHeader>

        {loading && <LoadingState label="Loading executions..." />}
        {error && !loading && (
          <ErrorState message={error instanceof Error ? error.message : 'Failed to load executions'} onRetry={() => refetch()} />
        )}
        {!loading && !error && data.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            This workflow hasn&apos;t run yet. It will execute automatically when its trigger fires.
          </p>
        )}
        {!loading && !error && data.length > 0 && (
          <div className="space-y-3">
            {data.map((exec: WorkflowExecution) => (
              <div key={exec.id} className="rounded-lg border border-brand/10 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-brand/10 px-2 py-1 text-xs text-brand">{exec.trigger}</code>
                    <StatusBadge status={exec.status} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(exec.startedAt).toLocaleString()}
                  </span>
                </div>
                {exec.error && (
                  <p className="mt-2 text-sm text-destructive">{exec.error}</p>
                )}
                {exec.logs && exec.logs.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {exec.logs.map((log) => (
                      <div key={log.id} className="flex items-start gap-2 text-xs">
                        <span
                          className={
                            log.status === 'SUCCESS'
                              ? 'text-emerald-500'
                              : log.status === 'FAILED' || log.status === 'ERROR'
                                ? 'text-destructive'
                                : 'text-muted-foreground'
                          }
                        >
                          [{log.status}]
                        </span>
                        <span className="text-foreground">{log.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
