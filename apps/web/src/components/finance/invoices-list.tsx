import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useInvoicesQuery, type InvoiceStatus } from '@/lib/api/invoices';
import { customersAPI } from '@/lib/api/customers';
import { formatMoney } from '@/lib/format';
import { InvoiceCreateDialog } from './invoice-create-dialog';
import { InvoiceDetailSheet } from './invoice-detail-sheet';

const STATUS_OPTIONS: InvoiceStatus[] = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'];

function getStatusBadgeClass(status: InvoiceStatus) {
  switch (status) {
    case 'DRAFT':
      return 'bg-gray-100 text-gray-800';
    case 'SENT':
      return 'bg-blue-100 text-blue-800';
    case 'PARTIALLY_PAID':
      return 'bg-yellow-100 text-yellow-800';
    case 'PAID':
      return 'bg-green-100 text-green-800';
    case 'OVERDUE':
    case 'CANCELLED':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function InvoicesList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useInvoicesQuery({
    page,
    limit: 20,
    search: search || undefined,
    status: status || undefined,
  });

  const { data: customers } = useQuery({
    queryKey: ['customers-for-invoice-list'],
    queryFn: () => customersAPI.list({ limit: 200, includeArchived: true }),
  });
  const customerNameById = new Map((customers?.items ?? []).map((c) => [c.id, c.companyName]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {isLoading ? 'Loading...' : isError ? 'Error loading invoices' : `${data?.meta.total ?? 0} invoices`}
          </p>
        </div>
        <InvoiceCreateDialog />
      </div>

      <div className="grid gap-4 rounded-lg border border-brand/10 bg-surface p-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-foreground">Search</label>
          <Input
            placeholder="Invoice number..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Status</label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as InvoiceStatus | '');
              setPage(1);
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
          </div>
        )}

        {isError && !isLoading && (
          <div className="p-6">
            <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load invoices'}
              <button onClick={() => refetch()} className="ml-2 font-semibold underline hover:no-underline">
                Retry
              </button>
            </div>
          </div>
        )}

        {!isLoading && !isError && (data?.items.length ?? 0) === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">No invoices found</p>
          </div>
        )}

        {!isLoading && (data?.items.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand/10 bg-surface/50">
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Invoice #</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Customer</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Due Date</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-foreground">Total</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-foreground">Balance</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand/10">
                {data!.items.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="cursor-pointer transition-colors hover:bg-background/40"
                    onClick={() => setSelectedInvoiceId(invoice.id)}
                  >
                    <td className="px-6 py-4 text-sm font-medium text-foreground">{invoice.invoiceNumber}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {customerNameById.get(invoice.customerId) ?? invoice.customerId}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-mono text-foreground">
                      {formatMoney(invoice.totalAmount, invoice.currency)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-mono text-foreground">
                      {formatMoney(invoice.balanceDue, invoice.currency)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeClass(invoice.status)}`}>
                        {invoice.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isLoading && (data?.items.length ?? 0) > 0 && (data?.meta.totalPages ?? 1) > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-brand/10 bg-surface p-4">
          <div className="text-sm text-muted-foreground">
            Page {data!.meta.page} of {data!.meta.totalPages} ({data!.meta.total} total)
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} variant="outline" size="sm">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => setPage((p) => Math.min(data!.meta.totalPages, p + 1))}
              disabled={page === data!.meta.totalPages}
              variant="outline"
              size="sm"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <InvoiceDetailSheet invoiceId={selectedInvoiceId} onOpenChange={(open) => !open && setSelectedInvoiceId(null)} />
    </div>
  );
}
