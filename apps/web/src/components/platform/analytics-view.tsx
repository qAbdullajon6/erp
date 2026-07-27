'use client';

import { Link } from '@tanstack/react-router';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { StatusBadge } from '@/components/shared/status-badge';
import { usePlatformAnalyticsQuery } from '@/lib/api/platform';
import { formatMoney } from '@/lib/format';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      <div className="rounded-lg border border-brand/10 p-4">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

export function AnalyticsView() {
  const { data, isLoading, isError, error, refetch } = usePlatformAnalyticsQuery();

  if (isLoading) return <LoadingState label="Loading analytics…" />;
  if (isError || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Failed to load analytics'}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Analytics" subtitle="Revenue, growth, churn, and usage across tenants" />

      <Section title="Revenue">
        <div className="grid gap-6 sm:grid-cols-3">
          <Stat label="MRR" value={formatMoney(data.revenue.mrrCents / 100, data.revenue.currency)} />
          <Stat label="Active subscriptions" value={data.revenue.activeSubscriptions} />
          <Stat label="Currency" value={data.revenue.currency} />
        </div>
      </Section>

      <Section title="Growth">
        <div className="grid gap-6 sm:grid-cols-2">
          <Stat label="New orgs this month" value={data.growth.newOrganizationsThisMonth} />
          <Stat label="New orgs prior month" value={data.growth.newOrganizationsPriorMonth} />
        </div>
      </Section>

      <Section title="Churn">
        <Stat label="Cancellations (last 30 days)" value={data.churn.cancellationsLast30Days} />
      </Section>

      <Section title="Usage">
        {data.usage.topCustomers.length === 0 ? (
          <EmptyState title="No usage data" description="Usage records will appear here once tenants generate activity." />
        ) : (
          <ul className="divide-y divide-border">
            {data.usage.topCustomers.map((row) => (
              <li key={row.organizationId} className="flex items-center justify-between gap-3 py-2.5">
                <Link
                  to="/platform/organizations/$orgId"
                  params={{ orgId: row.organizationId }}
                  className="font-medium hover:text-brand"
                >
                  {row.organizationName}
                </Link>
                <div className="flex items-center gap-3">
                  {row.status ? <StatusBadge status={row.status} /> : null}
                  <span className="tabular-nums text-sm text-muted-foreground">
                    {row.usageQuantity}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Top customers">
        {data.usage.topCustomers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Same as usage ranking — no data yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.usage.topCustomers.slice(0, 5).map((row, i) => (
              <div key={row.organizationId} className="flex items-center gap-3 text-sm">
                <span className="w-5 tabular-nums text-muted-foreground">{i + 1}.</span>
                <span className="flex-1 truncate font-medium">{row.organizationName}</span>
                <span className="tabular-nums text-muted-foreground">{row.usageQuantity}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Active organizations">
        <div className="grid gap-6 sm:grid-cols-2">
          <Stat label="Active organizations" value={data.activeOrganizations} />
          <div>
            <p className="text-sm text-muted-foreground">Plan mix</p>
            <ul className="mt-2 space-y-1">
              {data.planMix.map((row) => (
                <li key={row.plan} className="flex justify-between text-sm">
                  <span>{row.plan}</span>
                  <span className="tabular-nums text-muted-foreground">{row.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}
