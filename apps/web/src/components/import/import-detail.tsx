'use client';

import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, ErrorState } from '@/components/shared/list-states';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  useImportDetail,
  useCancelImport,
  useResumeImport,
  useRetryImport,
} from '@/hooks/use-imports';
import { importsAPI, downloadBlob } from '@/lib/api/imports';
import { ArrowLeft, Download, Loader2, XCircle, PlayCircle, RotateCcw } from 'lucide-react';

export function ImportDetail({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const { data: session, loading, error, refetch } = useImportDetail(sessionId);
  const cancelMutation = useCancelImport();
  const resumeMutation = useResumeImport();
  const retryMutation = useRetryImport();

  const handleDownloadErrors = async () => {
    try {
      downloadBlob(await importsAPI.downloadErrors(sessionId), `import-errors-${sessionId.slice(0, 8)}.csv`);
    } catch {
      toast.error('Failed to download error report');
    }
  };

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync(sessionId);
      toast.success('Cancellation requested');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel');
    }
  };

  const handleResume = async () => {
    try {
      await resumeMutation.mutateAsync(sessionId);
      toast.success('Import resumed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resume');
    }
  };

  const handleRetry = async () => {
    try {
      const result = await retryMutation.mutateAsync(sessionId);
      toast.success(`Retrying ${result.retriedRows} failed row(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to retry');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Import Detail" />
        <LoadingState label="Loading import details..." />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="space-y-6">
        <PageHeader title="Import Detail" />
        <ErrorState message={error instanceof Error ? error.message : 'Import not found'} onRetry={() => refetch()} />
      </div>
    );
  }

  const validationErrors = (session.validationErrors as Array<{ row: number; column: string; message: string; value?: string }>) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import Detail"
        subtitle={session.fileName}
        action={
          <Button variant="outline" onClick={() => navigate({ to: '/app/import/history' })} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to History
          </Button>
        }
      />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Entity" value={session.entityType} />
        <InfoCard label="Status" value={<StatusBadge status={session.status} />} />
        <InfoCard label="Format" value={session.format} />
        <InfoCard label="Duplicate Strategy" value={session.duplicateStrategy} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-7">
        <StatCard label="Total Rows" value={session.totalRows} />
        <StatCard label="Valid" value={session.validRows} variant="success" />
        <StatCard label="Invalid" value={session.invalidRows} variant="danger" />
        <StatCard label="Processed" value={session.processedRows} />
        <StatCard label="Imported" value={session.successfulRows} variant="success" />
        <StatCard label="Updated" value={session.updatedRows} variant="success" />
        <StatCard label="Failed" value={session.failedRows} variant="danger" />
      </div>

      {/* Each action is offered only in the state where the server accepts it —
          otherwise the button is a guaranteed 409. */}
      <div className="flex flex-wrap gap-3">
        {session.status === 'EXECUTING' && (
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={cancelMutation.isPending || session.cancelRequested}
            className="gap-2"
          >
            <XCircle className="h-4 w-4" />
            {session.cancelRequested ? 'Cancelling...' : 'Cancel Import'}
          </Button>
        )}
        {(session.status === 'CANCELLED' || session.status === 'FAILED') && (
          <Button onClick={handleResume} disabled={resumeMutation.isPending} className="gap-2">
            <PlayCircle className="h-4 w-4" />
            {resumeMutation.isPending ? 'Resuming...' : 'Resume Import'}
          </Button>
        )}
        {session.failedRows > 0 && session.status !== 'EXECUTING' && (
          <Button variant="outline" onClick={handleRetry} disabled={retryMutation.isPending} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            {retryMutation.isPending ? 'Retrying...' : `Retry ${session.failedRows} Failed Row(s)`}
          </Button>
        )}
      </div>

      {session.errorMessage && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {session.errorMessage}
        </div>
      )}

      {session.status === 'EXECUTING' && (
        <div className="rounded-lg border border-brand/10 bg-surface p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
            <div>
              <p className="text-sm font-medium text-foreground">Import in progress...</p>
              <p className="text-xs text-muted-foreground">
                {session.processedRows} of {session.totalRows} rows processed
              </p>
            </div>
          </div>
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{
                  width: `${session.totalRows > 0 ? (session.processedRows / session.totalRows) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="rounded-lg border border-brand/10 bg-surface p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground">Validation Errors</h3>
            <Button variant="outline" size="sm" onClick={handleDownloadErrors} className="gap-2">
              <Download className="h-3 w-3" />
              Download CSV
            </Button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Column</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validationErrors.slice(0, 50).map((err, i) => (
                  <TableRow key={i}>
                    <TableCell>{err.row}</TableCell>
                    <TableCell>{err.column || '—'}</TableCell>
                    <TableCell className="text-destructive">{err.message}</TableCell>
                    <TableCell className="text-muted-foreground">{err.value ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {validationErrors.length > 50 && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Showing 50 of {validationErrors.length} errors. Download CSV for full report.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-brand/10 bg-surface p-6 text-sm text-muted-foreground">
        <p>
          Imported by: <span className="text-foreground">{session.uploadedBy}</span>
        </p>
        <p>
          Created: <span className="text-foreground">{new Date(session.createdAt).toLocaleString()}</span>
        </p>
        {session.completedAt && (
          <p>
            Completed: <span className="text-foreground">{new Date(session.completedAt).toLocaleString()}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-brand/10 bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant?: 'success' | 'danger';
}) {
  return (
    <div className="rounded-lg border border-brand/10 bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${
          variant === 'success'
            ? 'text-success'
            : variant === 'danger'
              ? 'text-destructive'
              : 'text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
