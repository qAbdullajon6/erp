import { useFinanceSummaryQuery } from '@/lib/api/finance';
import { formatMoney } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/list-states';

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
      <ErrorState
        message={error instanceof Error ? error.message : 'Failed to load finance summary'}
        onRetry={() => refetch()}
      />
    );
  }

  const currency = data.currency || 'USD';
  const cards = [
    { label: 'Total Invoiced', value: formatMoney(data.invoices.totalInvoiced, currency), hint: `${data.invoices.count} invoices` },
    { label: 'Collected', value: formatMoney(data.invoices.totalCollected, currency), hint: 'paid to date' },
    { label: 'Outstanding', value: formatMoney(data.invoices.totalOutstanding, currency), hint: 'not yet collected' },
    {
      label: 'Overdue',
      value: formatMoney(data.invoices.overdueAmount, currency),
      hint: `${data.invoices.overdueCount} invoice${data.invoices.overdueCount === 1 ? '' : 's'}`,
      warn: data.invoices.overdueCount > 0,
    },
    {
      label: 'Pending Expenses',
      value: String(data.expenses.pendingCount),
      hint: 'awaiting approval',
      warn: data.expenses.pendingCount > 0,
    },
    { label: 'Est. Gross Profit', value: formatMoney(data.estimatedGrossProfit, currency), hint: 'collected − approved expenses' },
  ];

  return (
    <div className="space-y-4">
      {data.excludedOtherCurrencyCount > 0 && (
        <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
          Showing {currency} only. {data.excludedOtherCurrencyCount} invoice/expense
          {data.excludedOtherCurrencyCount === 1 ? '' : 's'} in other currencies{' '}
          {data.excludedOtherCurrencyCount === 1 ? 'is' : 'are'} excluded from these totals.
        </div>
      )}
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
    </div>
  );
}
