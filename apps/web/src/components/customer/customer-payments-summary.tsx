import { Link } from '@tanstack/react-router';
import { usePortalPaymentsList, usePortalPaymentsSummary } from '@/lib/api/portal-payments';
import { formatDate, formatMoney } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle, CreditCard, Wallet } from 'lucide-react';

export function CustomerPaymentsSummary({ showList = true }: { showList?: boolean }) {
  const { data: summary, isLoading: summaryLoading } = usePortalPaymentsSummary();
  const { data: list, isLoading: listLoading } = usePortalPaymentsList({ enabled: showList });

  if (summaryLoading) {
    return <Skeleton className="h-40 rounded-xl" />;
  }

  if (!summary) return null;

  const kpis = [
    {
      icon: Wallet,
      label: 'Outstanding balance',
      value: formatMoney(summary.outstandingBalance),
    },
    {
      icon: CreditCard,
      label: 'Paid this month',
      value: formatMoney(summary.paidThisMonth),
    },
    {
      icon: AlertTriangle,
      label: 'Overdue invoices',
      value: String(summary.overdueCount),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <kpi.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-xl font-semibold text-foreground">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {summary.lastPayment ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Last payment</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {formatMoney(summary.lastPayment.amount)} via {summary.lastPayment.method.replace(/_/g, ' ')}{' '}
            on {formatDate(summary.lastPayment.paymentDate)} for invoice{' '}
            <Link
              to="/portal/invoices/$invoiceId"
              params={{ invoiceId: summary.lastPayment.invoiceId }}
              className="font-medium text-brand hover:underline"
            >
              {summary.lastPayment.invoiceNumber}
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {showList ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment history</CardTitle>
          </CardHeader>
          <CardContent>
            {listLoading ? (
              <Skeleton className="h-32 rounded-lg" />
            ) : !list?.items?.length ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.items.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                      <TableCell>
                        <Link
                          to="/portal/invoices/$invoiceId"
                          params={{ invoiceId: payment.invoiceId }}
                          className="text-brand hover:underline"
                        >
                          {payment.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{payment.method.replace(/_/g, ' ')}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(payment.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
