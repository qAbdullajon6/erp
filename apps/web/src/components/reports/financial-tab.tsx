import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatMoney } from '@/lib/format';
import { useFinancialReportQuery, type ReportFilterParams, type ProfitabilityGroupRow } from '@/lib/api/reports';
import { ExportCsvButton } from './export-csv-button';

interface FinancialTabProps {
  params: ReportFilterParams;
}

function ProfitabilityTable({ rows }: { rows: ProfitabilityGroupRow[] }) {
  if (rows.length === 0) {
    return <p className="px-6 py-8 text-center text-sm text-muted-foreground">No delivered orders in this period</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-brand/10 bg-surface/50 text-left text-xs uppercase text-muted-foreground">
            <th className="px-6 py-3">Name</th>
            <th className="px-6 py-3 text-right">Orders</th>
            <th className="px-6 py-3 text-right">Revenue</th>
            <th className="px-6 py-3 text-right">Expenses</th>
            <th className="px-6 py-3 text-right">Est. Profit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand/10">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-6 py-3 font-medium text-foreground">{row.label}</td>
              <td className="px-6 py-3 text-right">{row.orderCount}</td>
              <td className="px-6 py-3 text-right">{formatMoney(row.revenue)}</td>
              <td className="px-6 py-3 text-right">{formatMoney(row.approvedExpenses)}</td>
              <td className={`px-6 py-3 text-right font-medium ${Number(row.estimatedGrossProfit) < 0 ? 'text-destructive' : ''}`}>
                {formatMoney(row.estimatedGrossProfit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FinancialTab({ params }: FinancialTabProps) {
  const { data, isLoading, isFetching, isError, error, refetch } = useFinancialReportQuery(params);
  const [profitabilityView, setProfitabilityView] = useState<'byCustomer' | 'byRoute' | 'byDriver' | 'byVehicle'>('byCustomer');

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg bg-destructive/10 p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Failed to load financial report'}
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  const { invoiceCollectionPerformance: icp } = data;
  const totalAging = data.receivablesAging.reduce((sum, b) => sum + Number(b.amount), 0);
  const totalExpenses = data.expenseBreakdown.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ExportCsvButton type="financial" params={params} />
      </div>
      {isFetching && !isLoading && <p className="text-xs text-muted-foreground">Refreshing for the new date range...</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Invoices</div>
          <div className="mt-3 font-display text-2xl font-bold text-foreground">{icp.invoiceCount}</div>
          <div className="mt-2 text-sm text-muted-foreground">{icp.paidInvoiceCount} fully paid</div>
        </div>
        <div className="rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Collection Rate</div>
          <div className="mt-3 font-display text-2xl font-bold text-foreground">{icp.collectionRate.toFixed(1)}%</div>
          <div className="mt-2 text-sm text-muted-foreground">
            {formatMoney(icp.totalCollected)} of {formatMoney(icp.totalInvoiced)}
          </div>
        </div>
        <div className="rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Avg. Days to Full Payment</div>
          <div className="mt-3 font-display text-2xl font-bold text-foreground">
            {icp.averageDaysToFullPayment === null ? '—' : icp.averageDaysToFullPayment.toFixed(1)}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">{icp.averageDaysToFullPayment === null ? 'no fully paid invoices yet' : 'days'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <h3 className="font-display text-lg font-bold text-foreground">Receivables Aging</h3>
          <div className="mt-4 space-y-3">
            {totalAging === 0 && <p className="text-sm text-muted-foreground">No outstanding receivables</p>}
            {data.receivablesAging.map((bucket) => (
              <div key={bucket.bucket}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{bucket.bucket === 'current' ? 'Current' : `${bucket.bucket} days`}</span>
                  <span className="font-semibold text-foreground">
                    {formatMoney(bucket.amount)} ({bucket.invoiceCount})
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-background/40">
                  <div
                    className={`h-full ${bucket.bucket === 'current' ? 'bg-success' : bucket.bucket === '90+' ? 'bg-destructive' : 'bg-warning'}`}
                    style={{ width: totalAging > 0 ? `${(Number(bucket.amount) / totalAging) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <h3 className="font-display text-lg font-bold text-foreground">Expense Breakdown</h3>
          <div className="mt-4 space-y-3">
            {data.expenseBreakdown.length === 0 && <p className="text-sm text-muted-foreground">No approved expenses in this period</p>}
            {data.expenseBreakdown.map((e) => (
              <div key={e.category}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{e.category.replace(/_/g, ' ')}</span>
                  <span className="font-semibold text-foreground">
                    {formatMoney(e.amount)} ({e.count})
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-background/40">
                  <div
                    className="h-full bg-brand"
                    style={{ width: totalExpenses > 0 ? `${(Number(e.amount) / totalExpenses) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
        <div className="border-b border-brand/10 px-6 py-4">
          <h3 className="font-display text-lg font-bold text-foreground">{data.profitability.label}</h3>
          <Tabs value={profitabilityView} onValueChange={(v) => setProfitabilityView(v as typeof profitabilityView)} className="mt-3">
            <TabsList>
              <TabsTrigger value="byCustomer">By Customer</TabsTrigger>
              <TabsTrigger value="byRoute">By Route</TabsTrigger>
              <TabsTrigger value="byDriver">By Driver</TabsTrigger>
              <TabsTrigger value="byVehicle">By Vehicle</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <ProfitabilityTable rows={data.profitability[profitabilityView]} />
      </div>
    </div>
  );
}
