import { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { useCurrentUser } from '@/lib/api/auth';
import { useInvoicesQuery, type InvoiceStatus } from '@/lib/api/invoices';
import { customersAPI } from '@/lib/api/customers';
import type { MembershipRole } from '@/lib/api/organizations';
import { formatMoney } from '@/lib/format';
import { INVOICE_WRITE_ROLES } from '@/lib/role-access';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { InvoiceCreateDialog } from './invoice-create-dialog';
import { InvoiceDetailSheet } from './invoice-detail-sheet';

const STATUS_OPTIONS: InvoiceStatus[] = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'];

export function InvoicesList() {
  const navigate = useNavigate({ from: '/app/finance' });
  const searchState = useSearch({ from: '/app/finance' });
  const page = searchState.invoicePage || 1;
  const search = searchState.invoiceSearch || '';
  const status = (searchState.invoiceStatus || '') as InvoiceStatus | '';
  // The URL is the source of truth — browser back/forward on invoiceId must
  // close/reopen the sheet, not just change the address bar underneath it.
  const selectedInvoiceId = searchState.invoiceId ?? null;
  const [localSearch, setLocalSearch] = useState(search);
  const { data: currentUser } = useCurrentUser();
  const canWrite = Boolean(
    currentUser && INVOICE_WRITE_ROLES.includes(currentUser.membership.role as MembershipRole),
  );

  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  const debouncedSearch = useDebouncedValue(localSearch, 300);
  useEffect(() => {
    if (debouncedSearch === search) return;
    void navigate({
      to: '/app/finance',
      search: (prev) => ({ ...prev, invoicePage: undefined, invoiceSearch: debouncedSearch || undefined }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const setStatus = (next: InvoiceStatus | '') => {
    void navigate({
      to: '/app/finance',
      search: (prev) => ({ ...prev, invoicePage: undefined, invoiceStatus: next || undefined }),
    });
  };

  const setPage = (next: number) => {
    void navigate({
      to: '/app/finance',
      search: (prev) => ({ ...prev, invoicePage: next === 1 ? undefined : next }),
    });
  };

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

  const openInvoice = (id: string) => {
    void navigate({ to: '/app/finance', search: (prev) => ({ ...prev, invoiceId: id }) });
  };
  const closeInvoice = () => {
    void navigate({ to: '/app/finance', search: (prev) => ({ ...prev, invoiceId: undefined }) });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {isLoading ? 'Loading...' : isError ? 'Error loading invoices' : `${data?.meta.total ?? 0} invoices`}
          </p>
        </div>
        {canWrite && <InvoiceCreateDialog />}
      </div>

      <div className="grid gap-4 rounded-lg border border-brand/10 bg-surface p-4 sm:grid-cols-2">
        <div>
          <label htmlFor="invoice-search" className="text-sm font-medium text-foreground">Search</label>
          <Input
            id="invoice-search"
            placeholder="Invoice number..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor="invoice-status" className="text-sm font-medium text-foreground">Status</label>
          <select
            id="invoice-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as InvoiceStatus | '')}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
        {isLoading && <LoadingState label="Loading invoices..." />}

        {isError && !isLoading && (
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load invoices'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && (data?.items.length ?? 0) === 0 && (
          <EmptyState title="No invoices found" description="Try adjusting search or status filters." />
        )}

        {!isLoading && (data?.items.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full" aria-label="Invoices">
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
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer transition-colors hover:bg-background/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
                    onClick={() => openInvoice(invoice.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openInvoice(invoice.id);
                      }
                    }}
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
                      <StatusBadge status={invoice.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isLoading && (data?.items.length ?? 0) > 0 && (data?.meta.totalPages ?? 1) > 1 && (
        <PaginationBar
          page={data!.meta.page}
          totalPages={data!.meta.totalPages}
          total={data!.meta.total}
          onPageChange={setPage}
        />
      )}

      <InvoiceDetailSheet invoiceId={selectedInvoiceId} onOpenChange={(open) => !open && closeInvoice()} />
    </div>
  );
}
