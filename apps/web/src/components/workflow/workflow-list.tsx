'use client';

import { useState, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useWorkflowList, useToggleWorkflow, useDeleteWorkflow } from '@/hooks/use-workflows';
import { WorkflowEditorDialog } from './workflow-editor-dialog';
import { WorkflowExecutionsDialog } from './workflow-executions-dialog';
import { Zap, Plus, History } from 'lucide-react';

export function WorkflowList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [executionsFor, setExecutionsFor] = useState<string | null>(null);

  const { data, meta, loading, error, refetch } = useWorkflowList({ page, limit: 20 });
  const toggleMutation = useToggleWorkflow();
  const deleteMutation = useDeleteWorkflow();

  const handlePageChange = useCallback((newPage: number) => setPage(newPage), []);

  const handleToggle = useCallback((id: string) => {
    toggleMutation.mutate(id, {
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to toggle workflow'),
    });
  }, [toggleMutation]);

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success('Workflow deleted'),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete workflow'),
    });
  }, [deleteMutation]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflows"
        subtitle={loading ? 'Loading...' : `${meta.total} workflow(s) configured`}
        action={
          <Button
            onClick={() => setEditorOpen(true)}
            className="gap-2 bg-gradient-brand text-brand-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New Workflow
          </Button>
        }
      />

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {loading && <LoadingState label="Loading workflows..." />}
        {error && !loading && (
          <ErrorState message={error instanceof Error ? error.message : 'Failed to load workflows'} onRetry={() => refetch()} />
        )}
        {!loading && !error && data.length === 0 && (
          <EmptyState
            title="No workflows yet"
            description="Automate your operations: trigger actions when orders, invoices, payments, and more change."
            action={
              <Button onClick={() => setEditorOpen(true)} className="gap-2 bg-gradient-brand text-brand-foreground hover:opacity-90">
                <Zap className="h-4 w-4" />
                Create your first workflow
              </Button>
            }
          />
        )}
        {!loading && !error && data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((wf) => (
                <TableRow key={wf.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{wf.name}</div>
                    {wf.description && (
                      <div className="text-sm text-muted-foreground line-clamp-1">{wf.description}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-brand/10 px-2 py-1 text-xs text-brand">
                      {wf.config.trigger.event}
                    </code>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={wf.active}
                        onCheckedChange={() => handleToggle(wf.id)}
                        aria-label="Toggle workflow"
                      />
                      <StatusBadge status={wf.active ? 'ACTIVE' : 'INACTIVE'} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExecutionsFor(wf.id)}
                        className="gap-1"
                      >
                        <History className="h-4 w-4" />
                        History
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate({ to: `/app/workflows/${wf.id}` })}
                      >
                        Edit
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                          >
                            Delete
                          </Button>
                        }
                        title="Delete this workflow?"
                        description="This cannot be undone."
                        confirmLabel="Delete"
                        onConfirm={() => handleDelete(wf.id)}
                        destructive
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {meta.totalPages > 1 && (
        <PaginationBar
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          onPageChange={handlePageChange}
        />
      )}

      <WorkflowEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />

      <WorkflowExecutionsDialog
        workflowId={executionsFor}
        onClose={() => setExecutionsFor(null)}
      />
    </div>
  );
}
