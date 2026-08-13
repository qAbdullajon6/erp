import { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/api/auth';
import { useInvoicesQuery, type InvoiceStatus } from '@/lib/api/invoices';
import { customersAPI } from '@/lib/api/customers';
import { describeError } from '@/lib/api/describe-error';
import type { MembershipRole } from '@/lib/api/organizations';
import { formatMoney } from '@/lib/format';
import { INVOICE_WRITE_ROLES } from '@/lib/role-access';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { ErrorState, EmptyState, TableSkeleton } from '@/components/shared/list-states';
import { ListToolbar, FilterSelect } from '@/components/shared/list-toolbar';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {/* The skeleton already says "loading"; repeating it here just adds a
              second thing that changes on arrival. */}
          {isLoading || isError
            ? null
            : `${data?.meta.total ?? 0} ${(data?.meta.total ?? 0) === 1 ? 'invoice' : 'invoices'}`}
        </p>
        {canWrite && <InvoiceCreateDialog />}
      </div>

      <ListToolbar
        searchValue={localSearch}
        onSearchChange={setLocalSearch}
        searchPlaceholder="Invoice number..."
      >
        <FilterSelect
          label="Status"
          value={status}
          onChange={(next) => setStatus(next as InvoiceStatus | '')}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </FilterSelect>
      </ListToolbar>

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {isLoading && <TableSkeleton columns={[2, 3, 2, 2, 2, 2]} label="Loading invoices" />}

        {isError && !isLoading && (
          <ErrorState
            message={describeError(error, 'Failed to load invoices')}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && (data?.items.length ?? 0) === 0 && (
          <EmptyState
            title={search || status ? 'No invoices match these filters' : 'No invoices yet'}
            description={
              search || status
                ? 'Clear the search box or choose a different status to widen the results.'
                : 'Invoices you raise against a customer order will appear here.'
            }
          />
        )}

        {!isLoading && (data?.items.length ?? 0) > 0 && (
          <Table aria-label="Invoices">
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                {/* Columns drop out as width allows, leaving invoice / balance /
                    status — what a phone user scans for. The customer is not lost
                    with its column: it moves under the invoice number below sm. */}
                <TableHead className="hidden sm:table-cell">Customer</TableHead>
                <TableHead className="hidden md:table-cell">Due date</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data!.items.map((invoice) => (
                <TableRow
                  key={invoice.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
                  onClick={() => openInvoice(invoice.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openInvoice(invoice.id);
                    }
                  }}
                >
                  <TableCell className="font-mono text-sm font-medium text-foreground">
                    <span className="whitespace-nowrap">{invoice.invoiceNumber}</span>
                    <span className="block truncate font-sans text-xs text-muted-foreground sm:hidden">
                      {customerNameById.get(invoice.customerId) ?? invoice.customerId}
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-[16rem] truncate text-sm text-foreground sm:table-cell">
                    {customerNameById.get(invoice.customerId) ?? invoice.customerId}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell">
                    {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-right font-mono text-sm text-foreground lg:table-cell">
                    {formatMoney(invoice.totalAmount, invoice.currency)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono text-sm font-semibold text-foreground">
                    {formatMoney(invoice.balanceDue, invoice.currency)}
                  </TableCell>
                  <TableCell className="text-sm">
                    <StatusBadge status={invoice.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
