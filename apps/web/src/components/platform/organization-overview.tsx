'use client';

import { Link, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { DetailField } from '@/components/shared/detail-field';
import { LoadingState, ErrorState } from '@/components/shared/list-states';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  usePlatformOrganizationQuery,
  useEnterOrganizationMutation,
  useUpdateOrganizationStatusMutation,
} from '@/lib/api/platform';
import { formatDate, formatMoney, formatRelativeTime } from '@/lib/format';

export function OrganizationOverview({ orgId }: { orgId: string }) {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = usePlatformOrganizationQuery(orgId);
  const { mutate: enterOrg, isPending: entering } = useEnterOrganizationMutation();
  const { mutate: updateStatus, isPending: updating } = useUpdateOrganizationStatusMutation();

  if (isLoading) return <LoadingState label="Loading organization…" />;
  if (isError || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Failed to load organization'}
        onRetry={() => refetch()}
      />
    );
  }

  const handleOpenErp = () => {
    enterOrg(orgId, {
      onSuccess: () => {
        toast.success(`Entered ${data.name}`);
        navigate({ to: '/app', replace: true });
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to open ERP'),
    });
  };

  const isSuspended = data.status === 'SUSPENDED';

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/platform/organizations"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Organizations
        </Link>
        <PageHeader
          title={data.name}
          subtitle={data.slug}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleOpenErp} disabled={entering} className="gap-2">
                <ExternalLink className="h-4 w-4" />
                {entering ? 'Opening…' : 'Open ERP'}
              </Button>
              {isSuspended ? (
                <ConfirmDialog
                  title="Restore organization?"
                  description={`Restore ${data.name} to ACTIVE status.`}
                  confirmLabel="Restore"
                  onConfirm={() =>
                    updateStatus(
                      { id: orgId, status: 'ACTIVE' },
                      {
                        onSuccess: () => toast.success('Organization restored'),
                        onError: (err) =>
                          toast.error(err instanceof Error ? err.message : 'Failed to restore'),
                      },
                    )
                  }
                  trigger={
                    <Button variant="outline" disabled={updating}>
                      Restore
                    </Button>
                  }
                />
              ) : (
                <ConfirmDialog
                  title="Suspend organization?"
                  description={`Suspend ${data.name}. Tenant users will be blocked until restored.`}
                  confirmLabel="Suspend"
                  destructive
                  onConfirm={() =>
                    updateStatus(
                      { id: orgId, status: 'SUSPENDED' },
                      {
                        onSuccess: () => toast.success('Organization suspended'),
                        onError: (err) =>
                          toast.error(err instanceof Error ? err.message : 'Failed to suspend'),
                      },
                    )
                  }
                  trigger={
                    <Button variant="destructive" disabled={updating}>
                      Suspend
                    </Button>
                  }
                />
              )}
            </div>
          }
        />
      </div>

      <div className="grid gap-6 rounded-lg border border-brand/10 p-6 sm:grid-cols-2 lg:grid-cols-3">
        <DetailField label="Status" value={<StatusBadge status={data.status} />} />
        <DetailField label="Timezone" value={data.timezone} />
        <DetailField label="Currency" value={data.defaultCurrency} />
        <DetailField label="Created" value={formatDate(data.createdAt)} />
        <DetailField label="Members" value={data.counts.memberships} />
        <DetailField label="Customers" value={data.counts.customers} />
        <DetailField label="Drivers" value={data.counts.drivers} />
        <DetailField label="Vehicles" value={data.counts.vehicles} />
        <DetailField label="Orders" value={data.counts.orders} />
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Subscription</h2>
        {data.subscription ? (
          <div className="grid gap-4 rounded-lg border border-brand/10 p-4 sm:grid-cols-3">
            <DetailField label="Plan" value={data.subscription.plan.name} />
            <DetailField
              label="Status"
              value={<StatusBadge status={data.subscription.status} />}
            />
            <DetailField
              label="Price"
              value={formatMoney(
                data.subscription.plan.price / 100,
                data.subscription.plan.currency,
              )}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No subscription on file.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Members</h2>
        <ul className="divide-y divide-border rounded-lg border border-brand/10">
          {data.members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">
                  {m.user.firstName} {m.user.lastName}
                </p>
                <p className="text-xs text-muted-foreground">{m.user.email}</p>
              </div>
              <StatusBadge status={m.role} />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Recent audit</h2>
        <ul className="divide-y divide-border rounded-lg border border-brand/10">
          {data.recentAudit.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted-foreground">No recent audit events.</li>
          ) : (
            data.recentAudit.map((log) => (
              <li key={log.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-mono text-sm">{log.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.entityType}
                    {log.entityId ? ` · ${log.entityId}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeTime(log.createdAt)}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
