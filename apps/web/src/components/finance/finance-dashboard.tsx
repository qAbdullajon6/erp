import { useFinanceSummaryQuery } from '@/lib/api/finance';
import { formatMoney } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export function FinanceDashboard() {
  const { data, isLoading, isError, error, refetch } = useFinanceSummaryQuery();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg bg-destructive/10 p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Failed to load finance summary'}
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  const cards = [
    { label: 'Total Invoiced', value: formatMoney(data.invoices.totalInvoiced), hint: `${data.invoices.count} invoices` },
    { label: 'Collected', value: formatMoney(data.invoices.totalCollected), hint: 'paid to date' },
    { label: 'Outstanding', value: formatMoney(data.invoices.totalOutstanding), hint: 'not yet collected' },
    {
      label: 'Overdue',
      value: formatMoney(data.invoices.overdueAmount),
      hint: `${data.invoices.overdueCount} invoice${data.invoices.overdueCount === 1 ? '' : 's'}`,
      warn: data.invoices.overdueCount > 0,
    },
    {
      label: 'Pending Expenses',
      value: String(data.expenses.pendingCount),
      hint: 'awaiting approval',
      warn: data.expenses.pendingCount > 0,
    },
    { label: 'Est. Gross Profit', value: formatMoney(data.estimatedGrossProfit), hint: 'collected − approved expenses' },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6"
        >
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{card.label}</div>
          <div className="mt-3 font-display text-2xl font-bold text-foreground">{card.value}</div>
          <div className={`mt-2 text-sm font-medium ${card.warn ? 'text-destructive' : 'text-muted-foreground'}`}>
            {card.hint}
          </div>
        </div>
      ))}
    </div>
  );
}
