import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/format';
import { useExecutiveOverviewQuery, type ReportFilterParams, type ComparisonPair } from '@/lib/api/reports';
import { ExportCsvButton } from './export-csv-button';

interface ExecutiveOverviewTabProps {
  params: ReportFilterParams;
}

function ChangeBadge({ pair }: { pair?: ComparisonPair }) {
  if (!pair || pair.changePercent === null) return null;
  const positive = pair.changePercent >= 0;
  return (
    <span className={`text-xs font-medium ${positive ? 'text-success' : 'text-destructive'}`}>
      {positive ? '+' : ''}
      {pair.changePercent.toFixed(1)}% vs prior period
    </span>
  );
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-muted-foreground/40',
  PENDING: 'bg-warning',
  ASSIGNED: 'bg-brand/70',
  PICKED_UP: 'bg-brand',
  IN_TRANSIT: 'bg-brand',
  DELIVERED: 'bg-success',
  CANCELLED: 'bg-destructive',
};

export function ExecutiveOverviewTab({ params }: ExecutiveOverviewTabProps) {
  const { data, isLoading, isFetching, isError, error, refetch } = useExecutiveOverviewQuery(params);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg bg-destructive/10 p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Failed to load executive overview'}
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  const { totals, comparison } = data;
  const kpis = [
    { label: 'Total Orders', value: totals.totalOrders.toLocaleString(), pair: comparison?.totalOrders },
    { label: 'Delivered', value: totals.deliveredOrders.toLocaleString(), pair: comparison?.deliveredOrders },
    { label: 'Active', value: totals.activeOrders.toLocaleString() },
    { label: 'Delayed', value: totals.delayedOrders.toLocaleString(), warn: totals.delayedOrders > 0 },
    { label: 'Revenue', value: formatMoney(totals.totalRevenue), pair: comparison?.totalRevenue },
    { label: 'Collected', value: formatMoney(totals.totalCollected), pair: comparison?.totalCollected },
    { label: 'Outstanding Receivables', value: formatMoney(totals.outstandingReceivables) },
    { label: 'Est. Gross Profit', value: formatMoney(totals.estimatedGrossProfit), pair: comparison?.estimatedGrossProfit },
    { label: 'Delivery Completion', value: `${totals.deliveryCompletionRate.toFixed(1)}%`, pair: comparison?.deliveryCompletionRate },
    { label: 'On-Time Rate', value: `${totals.onTimeDeliveryRate.toFixed(1)}%`, pair: comparison?.onTimeDeliveryRate },
  ];

  const hasRevenueData = data.revenueVsExpensesTimeSeries.some((b) => b.revenue > 0 || b.expenses > 0);
  const totalStatusCount = data.ordersByStatus.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ExportCsvButton type="executive-overview" params={params} />
      </div>

      {isFetching && !isLoading && (
        <p className="text-xs text-muted-foreground">Refreshing for the new date range...</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{kpi.label}</div>
            <div className="mt-3 font-display text-2xl font-bold text-foreground">{kpi.value}</div>
            <div className="mt-2">
              {kpi.pair ? <ChangeBadge pair={kpi.pair} /> : kpi.warn ? (
                <span className="text-xs font-medium text-destructive">needs attention</span>
              ) : (
                <span className="text-xs text-muted-foreground">&nbsp;</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <h3 className="font-display text-lg font-bold text-foreground">Revenue vs Expenses</h3>
          <div className="mt-4 h-64">
            {hasRevenueData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.revenueVsExpensesTimeSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="reportRevenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-brand)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--color-brand)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.4} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatMoney(value), name === 'revenue' ? 'Revenue' : 'Expenses']}
                    contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="var(--color-brand)" fill="url(#reportRevenueFill)" strokeWidth={2} />
                  <Area type="monotone" dataKey="expenses" stroke="var(--color-warning)" fill="transparent" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No revenue in this period
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <h3 className="font-display text-lg font-bold text-foreground">Orders by Status</h3>
          <div className="mt-4 space-y-3">
            {totalStatusCount === 0 && <p className="text-sm text-muted-foreground">No orders in this period</p>}
            {data.ordersByStatus.map((row) => (
              <div key={row.status}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{row.status.replace(/_/g, ' ')}</span>
                  <span className="font-semibold text-foreground">{row.count}</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-background/40">
                  <div
                    className={`h-full ${STATUS_COLORS[row.status] ?? 'bg-brand'}`}
                    style={{ width: totalStatusCount > 0 ? `${(row.count / totalStatusCount) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
          <div className="border-b border-brand/10 px-6 py-4">
            <h3 className="font-display text-lg font-bold text-foreground">Top Customers</h3>
          </div>
          {data.topCustomers.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">No delivered orders in this period</p>
          ) : (
            <div className="divide-y divide-brand/10">
              {data.topCustomers.map((c) => (
                <div key={c.customerId} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.companyName}</p>
                    <p className="text-xs text-muted-foreground">{c.orderCount} orders</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{formatMoney(c.revenue)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
          <div className="border-b border-brand/10 px-6 py-4">
            <h3 className="font-display text-lg font-bold text-foreground">Top Routes</h3>
          </div>
          {data.topRoutes.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">No delivered orders in this period</p>
          ) : (
            <div className="divide-y divide-brand/10">
              {data.topRoutes.map((r) => (
                <div key={`${r.pickupCity}-${r.deliveryCity}`} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {r.pickupCity} → {r.deliveryCity}
                    </p>
                    <p className="text-xs text-muted-foreground">{r.orderCount} orders</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{formatMoney(r.revenue)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
