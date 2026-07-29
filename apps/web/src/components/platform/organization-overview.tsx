'use client';

import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink, LifeBuoy, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { DetailField } from '@/components/shared/detail-field';
import { LoadingState, ErrorState } from '@/components/shared/list-states';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useCurrentUser } from '@/lib/api/auth';
import {
  usePlatformOrganizationQuery,
  useEnterOrganizationMutation,
  useExitSupportMutation,
  useUpdateOrganizationStatusMutation,
} from '@/lib/api/platform';
import { formatDate, formatDateTime, formatMoney, formatRelativeTime } from '@/lib/format';

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function formatDuration(startedAt: string, nowMs: number): string {
  const totalMinutes = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 60000));
  if (totalMinutes < 1) return 'Just started';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function OrganizationOverview({ orgId }: { orgId: string }) {
  const navigate = useNavigate();
  const { data: currentUser } = useCurrentUser();
  const { data, isLoading, isError, error, refetch } = usePlatformOrganizationQuery(orgId);
  const { mutate: enterOrg, isPending: entering } = useEnterOrganizationMutation();
  const { mutate: exitSupport, isPending: exiting } = useExitSupportMutation();
  const { mutate: updateStatus, isPending: updating } = useUpdateOrganizationStatusMutation();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

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
        toast.success(`Support session started for ${data.name}`);
        navigate({ to: '/app' });
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to open ERP'),
    });
  };

  const handleExitSupport = () => {
    exitSupport(undefined, {
      onSuccess: () => {
        toast.success('Exited support session');
        void refetch();
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to exit support'),
    });
  };

  const isSuspended = data.status === 'SUSPENDED';
  const trialDays = daysUntil(data.subscription?.trialEndsAt);
  const periodDays = daysUntil(data.subscription?.currentPeriodEnd);
  const seatUsed = data.seatUsage?.used ?? data.counts?.memberships ?? 0;
  const seatLimit = data.seatUsage?.limit ?? null;
  const seatLabel =
    seatLimit == null ? `${seatUsed} seats` : `${seatUsed} / ${seatLimit} seats`;
  const storageUsed = data.storage?.usedGb ?? 0;
  const storageLimit = data.storage?.limitGb ?? null;
  const storageLabel =
    storageLimit == null
      ? `${storageUsed.toFixed(1)} GB`
      : `${storageUsed.toFixed(1)} / ${storageLimit} GB`;
  const monthly = data.monthlyUsage ?? {
    orders: data.counts?.orders ?? 0,
    drivers: data.counts?.drivers ?? 0,
    invoices: 0,
  };
  const support = data.activeSupportSession ?? null;
  const isOwnSupport =
    Boolean(support && currentUser && support.operator.id === currentUser.user.id);

  let subscriptionSummary = 'No subscription';
  let trialRemainingLabel = '—';
  if (data.subscription) {
    if (data.subscription.status === 'TRIAL' && trialDays != null) {
      subscriptionSummary =
        trialDays >= 0 ? `Trial · ${data.subscription.plan.name}` : 'Trial · Expired';
      trialRemainingLabel =
        trialDays >= 0 ? `${trialDays} day${trialDays === 1 ? '' : 's'} left` : 'Expired';
    } else {
      const renew =
        periodDays != null && periodDays >= 0 ? ` · Renews in ${periodDays} days` : '';
      subscriptionSummary = `${data.subscription.plan.name} · ${data.subscription.status}${renew}`;
      trialRemainingLabel = '—';
    }
  }

  const renewalLabel =
    data.subscription?.currentPeriodEnd != null
      ? formatDate(data.subscription.currentPeriodEnd)
      : '—';

  return (
    <div className="space-y-6 sm:space-y-8">
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
              <ConfirmDialog
                title={`Open ERP for ${data.name}?`}
                description="Starts an audited support session in this organization's tenant ERP. Exit from the banner when finished."
                confirmLabel="Open ERP"
                onConfirm={handleOpenErp}
                trigger={
                  <Button disabled={entering} className="gap-2">
                    <ExternalLink className="h-4 w-4" />
                    {entering ? 'Opening…' : 'Open ERP'}
                  </Button>
                }
              />
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

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Support Session</h2>
        {support ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-950 dark:text-amber-100">
                <LifeBuoy className="h-4 w-4 shrink-0" />
                Active support in this organization
              </div>
              {isOwnSupport ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={exiting}
                  onClick={handleExitSupport}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {exiting ? 'Exiting…' : 'Exit Support'}
                </Button>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <DetailField
                label="Operator"
                value={
                  support.operator.isPlatformAdmin
                    ? `Platform Admin · ${support.operator.firstName} ${support.operator.lastName}`
                    : `${support.operator.firstName} ${support.operator.lastName}`
                }
              />
              <DetailField label="Started" value={formatDateTime(support.startedAt)} />
              <DetailField label="Duration" value={formatDuration(support.startedAt, nowMs)} />
              <DetailField label="Status" value={<StatusBadge status={support.status} />} />
            </div>
            <p className="mt-3 truncate text-xs text-muted-foreground">{support.operator.email}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-brand/15 px-4 py-6 text-sm text-muted-foreground">
            No active support session. Use Open ERP to start an audited session in this tenant.
          </div>
        )}
      </section>

      <div className="grid gap-4 rounded-lg border border-brand/10 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3 xl:grid-cols-4">
        <DetailField label="Organization status" value={<StatusBadge status={data.status} />} />
        <DetailField label="Current plan" value={data.subscription?.plan.name ?? '—'} />
        <DetailField
          label="Subscription status"
          value={
            data.subscription ? (
              <StatusBadge status={data.subscription.status} />
            ) : (
              'No subscription'
            )
          }
        />
        <DetailField label="Trial remaining" value={trialRemainingLabel} />
        <DetailField label="Renewal" value={renewalLabel} />
        <DetailField label="Seat usage" value={seatLabel} />
        <DetailField
          label="Last login"
          value={data.lastLoginAt ? formatRelativeTime(data.lastLoginAt) : '—'}
        />
        <DetailField label="Storage" value={storageLabel} />
        <DetailField label="Timezone" value={data.timezone} />
        <DetailField label="Currency" value={data.defaultCurrency} />
        <DetailField label="Created" value={formatDate(data.createdAt)} />
        <DetailField label="Subscription summary" value={subscriptionSummary} />
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Monthly usage</h2>
        <div className="grid gap-4 rounded-lg border border-brand/10 p-4 sm:grid-cols-3">
          <DetailField label="Orders" value={monthly.orders} />
          <DetailField label="Drivers" value={monthly.drivers} />
          <DetailField label="Invoices" value={monthly.invoices} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Fleet & CRM</h2>
        <div className="grid gap-4 rounded-lg border border-brand/10 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailField label="Members" value={data.counts.memberships} />
          <DetailField label="Customers" value={data.counts.customers} />
          <DetailField label="Drivers" value={data.counts.drivers} />
          <DetailField label="Vehicles" value={data.counts.vehicles} />
          <DetailField label="Orders (all time)" value={data.counts.orders} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Subscription detail</h2>
        {data.subscription ? (
          <div className="grid gap-4 rounded-lg border border-brand/10 p-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <DetailField
              label="Trial ends"
              value={
                data.subscription.trialEndsAt
                  ? formatDate(data.subscription.trialEndsAt)
                  : '—'
              }
            />
            <DetailField
              label="Period end / renewal"
              value={
                data.subscription.currentPeriodEnd
                  ? formatDate(data.subscription.currentPeriodEnd)
                  : '—'
              }
            />
            <DetailField
              label="Seats"
              value={
                data.subscription.seats == null ? 'Unlimited' : String(data.subscription.seats)
              }
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No subscription on file. Converted organizations always receive one at create time.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Recent activity</h2>
        <ul className="divide-y divide-border rounded-lg border border-brand/10">
          {data.recentAudit.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted-foreground">No recent activity.</li>
          ) : (
            data.recentAudit.map((log) => (
              <li
                key={log.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm">{log.action}</p>
                  <p className="truncate text-xs text-muted-foreground">
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

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Members</h2>
        <ul className="divide-y divide-border rounded-lg border border-brand/10">
          {data.members
            .filter((m) => !m.user.isPlatformAdmin)
            .map((m) => (
              <li
                key={m.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {m.user.firstName} {m.user.lastName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
                </div>
                <StatusBadge status={m.role} />
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
