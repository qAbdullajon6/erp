'use client';

import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { DetailField } from '@/components/shared/detail-field';
import { LoadingState, ErrorState } from '@/components/shared/list-states';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  usePlatformSupportTicketQuery,
  useUpdateSupportTicketMutation,
  type SupportTicketStatus,
  type SupportTicketPriority,
} from '@/lib/api/platform';
import { formatDate } from '@/lib/format';

const STATUSES: SupportTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const PRIORITIES: SupportTicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const SELECT_CLASS =
  'h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50';

export function SupportTicketDetail({ ticketId }: { ticketId: string }) {
  const { data, isLoading, isError, error, refetch } = usePlatformSupportTicketQuery(ticketId);
  const { mutate: updateTicket, isPending } = useUpdateSupportTicketMutation();

  if (isLoading) return <LoadingState label="Loading ticket…" />;
  if (isError || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Failed to load ticket'}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/platform/support"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Support
        </Link>
        <PageHeader title={data.subject} subtitle={`Created ${formatDate(data.createdAt)}`} />
      </div>

      <div className="grid gap-6 rounded-lg border border-brand/10 p-6 sm:grid-cols-2">
        <DetailField
          label="Status"
          value={
            <select
              value={data.status}
              disabled={isPending}
              className={SELECT_CLASS}
              aria-label="Ticket status"
              onChange={(e) =>
                updateTicket(
                  { id: ticketId, input: { status: e.target.value as SupportTicketStatus } },
                  {
                    onSuccess: () => toast.success('Status updated'),
                    onError: (err) =>
                      toast.error(err instanceof Error ? err.message : 'Update failed'),
                  },
                )
              }
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          }
        />
        <DetailField
          label="Priority"
          value={
            <select
              value={data.priority}
              disabled={isPending}
              className={SELECT_CLASS}
              aria-label="Ticket priority"
              onChange={(e) =>
                updateTicket(
                  { id: ticketId, input: { priority: e.target.value as SupportTicketPriority } },
                  {
                    onSuccess: () => toast.success('Priority updated'),
                    onError: (err) =>
                      toast.error(err instanceof Error ? err.message : 'Update failed'),
                  },
                )
              }
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          }
        />
        <DetailField
          label="Organization"
          value={
            data.organization ? (
              <Link
                to="/platform/organizations/$orgId"
                params={{ orgId: data.organization.id }}
                className="hover:text-brand"
              >
                {data.organization.name}
              </Link>
            ) : (
              '—'
            )
          }
        />
        <DetailField
          label="Assignee"
          value={
            data.assignee
              ? `${data.assignee.firstName} ${data.assignee.lastName} (${data.assignee.email})`
              : 'Unassigned'
          }
        />
        <DetailField label="Current status" value={<StatusBadge status={data.status} />} />
        <DetailField
          label="Resolved"
          value={data.resolvedAt ? formatDate(data.resolvedAt) : '—'}
        />
      </div>

      <section className="space-y-2 rounded-lg border border-brand/10 p-6">
        <h2 className="text-sm font-medium text-muted-foreground">Body</h2>
        <p className="whitespace-pre-wrap text-sm text-foreground">{data.body}</p>
      </section>
    </div>
  );
}
