'use client';

import { Link } from '@tanstack/react-router';
import { Building2, CreditCard, Inbox, LifeBuoy, Bell } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { StatusBadge } from '@/components/shared/status-badge';
import { usePlatformDashboardQuery } from '@/lib/api/platform';
import { formatMoney, formatRelativeTime } from '@/lib/format';
import { describeError } from '@/lib/api/describe-error';

function KpiCard({
  label,
  value,
  href,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  href?: string;
  icon: typeof Building2;
}) {
  const body = (
    <div className="rounded-xl border border-brand/10 bg-surface p-4 transition-colors hover:border-brand/30">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
  return href ? (
    <Link to={href as string}>{body}</Link>
  ) : (
    body
  );
}

export function PlatformDashboard() {
  const { data, isLoading, isError, error, refetch } = usePlatformDashboardQuery();

  if (isLoading) return <LoadingState label="Loading dashboard…" />;
  if (isError || !data) {
    return (
      <ErrorState
        message={describeError(error, 'Failed to load dashboard')}
        onRetry={() => refetch()}
      />
    );
  }

  const { kpis, attention } = data;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Platform Dashboard"
        subtitle="Organizations, revenue, and items that need attention"
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Active orgs"
          value={kpis.activeOrganizations}
          href="/platform/organizations"
          icon={Building2}
        />
        <KpiCard label="New this month" value={kpis.newOrganizationsThisMonth} icon={Building2} />
        <KpiCard
          label="MRR"
          value={formatMoney(kpis.mrrCents / 100)}
          href="/platform/subscriptions"
          icon={CreditCard}
        />
        <KpiCard
          label="Open tickets"
          value={kpis.openTickets}
          href="/platform/support"
          icon={LifeBuoy}
        />
        <KpiCard
          label="Unread alerts"
          value={kpis.unreadNotifications}
          icon={Bell}
        />
        <KpiCard
          label="Failed payments"
          value={kpis.failedPayments}
          href="/platform/subscriptions"
          icon={Inbox}
        />
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-foreground">Needs attention</h2>
        <div className="overflow-hidden rounded-lg border border-brand/10">
          {attention.length === 0 ? (
            <EmptyState title="All clear" description="No unread platform alerts right now." />
          ) : (
            <ul className="divide-y divide-border">
              {attention.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{item.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{item.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatRelativeTime(item.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={item.severity} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
