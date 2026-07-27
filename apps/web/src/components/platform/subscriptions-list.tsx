'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/page-header';
import { FilterSelect } from '@/components/shared/list-toolbar';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  usePlatformSubscriptionsQuery,
  useUpdateSubscriptionStatusMutation,
  type SubscriptionStatus,
} from '@/lib/api/platform';
import { formatDate, formatMoney } from '@/lib/format';

const STATUSES: SubscriptionStatus[] = ['TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'];

const SELECT_CLASS =
  'h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50';

export function SubscriptionsList() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<SubscriptionStatus | ''>('');
  const { data, isLoading, isError, error, refetch } = usePlatformSubscriptionsQuery({
    page,
    limit: 20,
    status: status || undefined,
  });
  const { mutate: updateStatus, isPending } = useUpdateSubscriptionStatusMutation();

  const items = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscriptions"
        subtitle={
          isLoading ? 'Loading…' : isError ? 'Error loading subscriptions' : `${meta?.total ?? 0} subscriptions`
        }
      />

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-brand/10 bg-surface p-4">
        <FilterSelect
          label="Status"
          value={status}
          onChange={(value) => {
            setStatus(value as SubscriptionStatus | '');
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </FilterSelect>
      </div>

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {isLoading && <LoadingState label="Loading subscriptions…" />}
        {isError && !isLoading && (
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load subscriptions'}
            onRetry={() => refetch()}
          />
        )}
        {!isLoading && !isError && items.length === 0 && (
          <EmptyState title="No subscriptions" description="No subscriptions match the current filter." />
        )}
        {!isLoading && !isError && items.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface/50 hover:bg-surface/50">
                  <TableHead>Organization</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Period end</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>
                      <Link
                        to="/platform/organizations/$orgId"
                        params={{ orgId: sub.organization.id }}
                        className="font-medium hover:text-brand"
                      >
                        {sub.organization.name}
                      </Link>
                    </TableCell>
                    <TableCell>{sub.plan.name}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatMoney(sub.plan.price / 100, sub.plan.currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {sub.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={sub.status} />
                        <select
                          value={sub.status}
                          disabled={isPending}
                          aria-label={`Status for ${sub.organization.name}`}
                          className={SELECT_CLASS}
                          onChange={(e) =>
                            updateStatus(
                              { id: sub.id, status: e.target.value as SubscriptionStatus },
                              {
                                onSuccess: () => toast.success('Subscription updated'),
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {meta && (
        <PaginationBar
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
