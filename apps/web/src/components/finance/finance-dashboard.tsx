import { AlertTriangle, Banknote, FileText, HandCoins, Hourglass, Receipt } from 'lucide-react';
import { useFinanceSummaryQuery } from '@/lib/api/finance';
import { formatMoney } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { MetricCard, type MetricCardProps } from '@/components/ui/metric-card';
import { ErrorState } from '@/components/shared/list-states';
import { describeError } from '@/lib/api/describe-error';

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
        message={describeError(error, 'Failed to load finance summary')}
        onRetry={() => refetch()}
      />
    );
  }

  const currency = data.currency || 'USD';
  const overdueCount = data.invoices.overdueCount;
  const pendingExpenses = data.expenses.pendingCount;
  const overdueText = `${overdueCount} invoice${overdueCount === 1 ? '' : 's'}`;

  // "Cash margin", not "Est. Gross Profit": this figure is collected cash less
  // approved expenses, while Reports computes gross profit from delivered
  // revenue. Both are correct and they legitimately differ, but under one name
  // the two screens simply looked like they disagreed.
  const cards: MetricCardProps[] = [
    {
      label: 'Total Invoiced',
      value: formatMoney(data.invoices.totalInvoiced, currency),
      icon: FileText,
      footer: `${data.invoices.count} invoices`,
    },
    {
      label: 'Collected',
      value: formatMoney(data.invoices.totalCollected, currency),
      icon: Banknote,
      footer: 'paid to date',
    },
    {
      label: 'Outstanding',
      value: formatMoney(data.invoices.totalOutstanding, currency),
      icon: Hourglass,
      footer: 'not yet collected',
    },
    {
      label: 'Overdue',
      value: formatMoney(data.invoices.overdueAmount, currency),
      icon: AlertTriangle,
      ...(overdueCount > 0
        ? { note: { icon: AlertTriangle, text: overdueText, tone: 'warning' as const } }
        : { footer: overdueText }),
    },
    {
      label: 'Pending Expenses',
      value: String(pendingExpenses),
      icon: Receipt,
      ...(pendingExpenses > 0
        ? { note: { icon: AlertTriangle, text: 'awaiting approval', tone: 'warning' as const } }
        : { footer: 'none awaiting approval' }),
    },
    {
      label: 'Cash Margin',
      value: formatMoney(data.estimatedGrossProfit, currency),
      icon: HandCoins,
      footer: 'collected − approved expenses',
    },
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
          <MetricCard key={card.label} {...card} variant="compact" />
        ))}
      </div>
    </div>
  );
}
