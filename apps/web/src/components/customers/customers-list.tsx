'use client';

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useCustomersList,
  type Customer,
  type CustomerSortField,
  type CustomerStatus,
} from '@/lib/api/customers';
import { useCurrentUser } from '@/lib/api/auth';
import { CUSTOMER_WRITE_ROLES, INVOICE_READ_ROLES } from '@/lib/role-access';
import type { MembershipRole } from '@/lib/api/organizations';
import { ErrorState, EmptyState, ListSkeleton } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { CustomersCreateSheet } from '@/components/customers/customers-create-sheet';
import { CustomersEditSheet } from '@/components/customers/customers-edit-sheet';
import {
  creditUtilization,
  useCustomerRelationshipIndex,
} from '@/components/customers/customer-relationship-stats';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { formatMoney, formatRelativeTime } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Building2,
  Download,
  Edit2,
  ExternalLink,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  User,
} from 'lucide-react';
import { toast } from 'sonner';

type CrmTab = 'active' | 'high_value' | 'outstanding' | 'inactive' | 'archived' | 'all';

const TAB_CONFIG: { key: CrmTab; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'high_value', label: 'High Value' },
  { key: 'outstanding', label: 'Outstanding Balance' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
];

function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function tabToQuery(tab: CrmTab): {
  status?: CustomerStatus;
  includeArchived?: boolean;
  sortBy?: CustomerSortField;
  sortOrder?: 'asc' | 'desc';
} {
  switch (tab) {
    case 'active':
      return { status: 'ACTIVE', sortBy: 'companyName', sortOrder: 'asc' };
    case 'high_value':
      return { status: 'ACTIVE', sortBy: 'creditLimit', sortOrder: 'desc' };
    case 'inactive':
      return { status: 'INACTIVE', sortBy: 'updatedAt', sortOrder: 'desc' };
    case 'archived':
      return { status: 'ARCHIVED', includeArchived: true, sortBy: 'updatedAt', sortOrder: 'desc' };
    case 'outstanding':
      return { includeArchived: false, sortBy: 'companyName', sortOrder: 'asc' };
    case 'all':
    default:
      return { includeArchived: false, sortBy: 'updatedAt', sortOrder: 'desc' };
  }
}

export function CustomersList() {
  const navigate = useNavigate();
  const searchState = useSearch({ from: '/app/customers/' });
  const { data: currentUser } = useCurrentUser();
  const role = currentUser?.membership.role as MembershipRole | undefined;
  const canWrite = Boolean(role && CUSTOMER_WRITE_ROLES.includes(role));
  const canViewInvoices = Boolean(role && INVOICE_READ_ROLES.includes(role));

  const tab = (TAB_CONFIG.some((t) => t.key === searchState.tab)
    ? searchState.tab
    : 'active') as CrmTab;
  const page = searchState.page || 1;
  const search = searchState.search || '';
  const createOpen = Boolean(searchState.create);
  const tabQuery = tabToQuery(tab);
  const allowedSort: CustomerSortField[] = [
    'customerCode',
    'companyName',
    'createdAt',
    'updatedAt',
    'creditLimit',
    'status',
  ];
  const sortBy = allowedSort.includes(searchState.sortBy as CustomerSortField)
    ? (searchState.sortBy as CustomerSortField)
    : tabQuery.sortBy || 'updatedAt';
  const sortOrder =
    searchState.sortOrder === 'asc' || searchState.sortOrder === 'desc'
      ? searchState.sortOrder
      : tabQuery.sortOrder || 'desc';

  const listEnabled = tab !== 'outstanding';
  const { data, meta, loading, error, refetch } = useCustomersList(
    {
      page: listEnabled ? page : 1,
      limit: listEnabled ? 20 : 200,
      search: search || undefined,
      status: tabQuery.status,
      includeArchived: tabQuery.includeArchived,
      sortBy,
      sortOrder,
    },
    { enabled: true },
  );

  const relationships = useCustomerRelationshipIndex({
    enabled: true,
    canViewInvoices,
  });

  const activeCount = useCustomersList({ status: 'ACTIVE', limit: 1 });
  const atRiskCount = useCustomersList({ status: 'AT_RISK', limit: 1 });
  const recentCustomers = useCustomersList({
    sortBy: 'createdAt',
    sortOrder: 'desc',
    limit: 100,
  });

  const [localSearch, setLocalSearch] = useState(search);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);

  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  const debouncedSearch = useDebouncedValue(localSearch, 300);
  useEffect(() => {
    if (debouncedSearch === search) return;
    navigate({
      to: '/app/customers',
      search: (prev) => ({
        ...prev,
        page: 1,
        search: debouncedSearch || undefined,
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const newThisMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let count = 0;
    for (const c of recentCustomers.data) {
      const d = new Date(c.createdAt);
      if (d.getFullYear() === y && d.getMonth() === m) count += 1;
      else if (d.getFullYear() < y || (d.getFullYear() === y && d.getMonth() < m)) break;
    }
    return count;
  }, [recentCustomers.data]);

  const highUtilCount = useMemo(() => {
    const ids = new Set<string>();
    for (const c of [...recentCustomers.data, ...data]) {
      const util = creditUtilization(c.creditLimit, relationships.getStats(c.id).outstanding);
      if (util != null && util >= 0.8) ids.add(c.id);
    }
    return ids.size;
  }, [recentCustomers.data, data, relationships]);

  const displayRows = useMemo(() => {
    if (tab !== 'outstanding') return data;
    return data.filter((c) => relationships.outstandingCustomerIds.has(c.id));
  }, [tab, data, relationships.outstandingCustomerIds]);

  const setCreateOpen = (open: boolean) => {
    navigate({
      to: '/app/customers',
      search: (prev) => ({
        ...prev,
        create: open ? true : undefined,
      }),
    });
  };

  const setTab = (next: CrmTab) => {
    const q = tabToQuery(next);
    navigate({
      to: '/app/customers',
      search: {
        page: 1,
        search: search || undefined,
        tab: next,
        sortBy: q.sortBy,
        sortOrder: q.sortOrder,
      },
    });
  };

  const handleExport = () => {
    if (displayRows.length === 0) {
      toast.error('Nothing to export on this page');
      return;
    }
    const rows = displayRows.map((c) => {
      const stats = relationships.getStats(c.id);
      const util = creditUtilization(c.creditLimit, stats.outstanding);
      return {
        code: c.customerCode,
        company: c.companyName,
        contact: c.contactName,
        email: c.email ?? '',
        phone: c.phone ?? '',
        status: c.status,
        creditLimit: c.creditLimit,
        openOrders: stats.openOrders,
        invoices: stats.invoiceCount,
        outstanding: stats.outstanding,
        utilization: util != null ? `${Math.round(util * 100)}%` : '',
        updatedAt: c.updatedAt,
      };
    });
    downloadCsv(
      `customers-page-${page}.csv`,
      toCsv(rows, [
        { key: 'code', label: 'Code' },
        { key: 'company', label: 'Company' },
        { key: 'contact', label: 'Contact' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'status', label: 'Status' },
        { key: 'creditLimit', label: 'Credit limit' },
        { key: 'openOrders', label: 'Open orders' },
        { key: 'invoices', label: 'Invoices' },
        { key: 'outstanding', label: 'Outstanding' },
        { key: 'utilization', label: 'Utilization' },
        { key: 'updatedAt', label: 'Updated' },
      ]),
    );
    toast.success('Exported current page');
  };

  const summaryChips = [
    { key: 'active', label: 'Active customers', value: activeCount.meta.total },
    { key: 'new', label: 'New this month', value: newThisMonth },
    canViewInvoices
      ? { key: 'out', label: 'Outstanding invoices', value: relationships.openInvoiceCount }
      : null,
    canViewInvoices
      ? { key: 'util', label: 'High credit utilization', value: highUtilCount }
      : null,
    atRiskCount.meta.total > 0
      ? { key: 'risk', label: 'At risk', value: atRiskCount.meta.total }
      : null,
  ].filter((c): c is { key: string; label: string; value: number } => Boolean(c && c.value > 0));

  const hasFilters = Boolean(search || tab !== 'active');

  return (
    <div className="space-y-4" data-testid="customers-page">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Customers</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loading ? 'Loading…' : error ? 'Could not load accounts' : `${meta.total} accounts`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleExport} disabled={displayRows.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export
          </Button>
          {canWrite && (
            <Button
              size="sm"
              className="bg-gradient-brand text-brand-foreground hover:opacity-90"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Customer
            </Button>
          )}
        </div>
      </div>

      {/* Search + quick filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search company, contact, email, phone…"
            data-testid="customers-search-input"
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <Button
          size="sm"
          variant={tab === 'active' ? 'secondary' : 'outline'}
          className="h-9"
          onClick={() => setTab('active')}
        >
          Active
        </Button>
        {canViewInvoices && (
          <Button
            size="sm"
            variant={tab === 'outstanding' ? 'secondary' : 'outline'}
            className="h-9"
            onClick={() => setTab('outstanding')}
          >
            Outstanding
          </Button>
        )}
        <Button
          size="sm"
          variant={tab === 'high_value' ? 'secondary' : 'outline'}
          className="h-9"
          onClick={() => setTab('high_value')}
        >
          High value
        </Button>
      </div>

      {relationships.truncated && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
          Open orders / invoices exceed what this page can total — per-account balances and
          utilization below may be understated. Open an account to see its own full history.
        </div>
      )}

      {/* Ops summary strip */}
      {summaryChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {summaryChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/20 px-2.5 py-1 text-xs text-foreground"
            >
              <span className="text-muted-foreground">{chip.label}</span>
              <span className="font-semibold tabular-nums">{chip.value}</span>
            </span>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border/60">
        {TAB_CONFIG.filter((t) => t.key !== 'outstanding' || canViewInvoices).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t.key
                ? 'border-brand text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-surface">
        {loading && <ListSkeleton rows={6} label="Loading customers" />}
        {error && !loading && <ErrorState message={error} onRetry={() => refetch()} />}

        {!loading && !error && displayRows.length === 0 && (
          <EmptyState
            title={hasFilters ? 'No customers match' : 'No customers yet'}
            description={
              hasFilters
                ? tab === 'outstanding'
                  ? 'No accounts with an open invoice balance in the loaded set.'
                  : 'Try another tab or clear search.'
                : 'Add an account before creating orders for them.'
            }
            action={
              hasFilters ? (
                <Button variant="outline" onClick={() => setTab('active')}>
                  Show active
                </Button>
              ) : canWrite ? (
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  New Customer
                </Button>
              ) : undefined
            }
          />
        )}

        {!loading && !error && displayRows.length > 0 && (
          <ul className="divide-y divide-border/50" data-testid="customers-table">
            {displayRows.map((customer) => (
              <CustomerCrmRow
                key={customer.id}
                customer={customer}
                stats={relationships.getStats(customer.id)}
                selected={selectedId === customer.id}
                canWrite={canWrite}
                canViewInvoices={canViewInvoices}
                onSelect={() => setSelectedId(customer.id)}
                onOpen={() =>
                  navigate({ to: '/app/customers/$customerId', params: { customerId: customer.id } })
                }
                onEdit={() => setEditing(customer)}
              />
            ))}
          </ul>
        )}
      </div>

      {tab !== 'outstanding' && !loading && !error && meta.totalPages > 1 && (
        <PaginationBar
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          onPageChange={(newPage) =>
            navigate({
              to: '/app/customers',
              search: (prev) => ({ ...prev, page: newPage }),
            })
          }
        />
      )}

      {canWrite && (
        <CustomersCreateSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(c) =>
            navigate({ to: '/app/customers/$customerId', params: { customerId: c.id } })
          }
        />
      )}

      {editing && (
        <CustomersEditSheet
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          customer={editing}
        />
      )}
    </div>
  );
}

function CustomerCrmRow({
  customer,
  stats,
  selected,
  canWrite,
  canViewInvoices,
  onSelect,
  onOpen,
  onEdit,
}: {
  customer: Customer;
  stats: ReturnType<ReturnType<typeof useCustomerRelationshipIndex>['getStats']>;
  selected: boolean;
  canWrite: boolean;
  canViewInvoices: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const util = creditUtilization(customer.creditLimit, stats.outstanding);
  const credit = parseFloat(customer.creditLimit);
  const highUtil = util != null && util >= 0.8;
  const atRisk = customer.status === 'AT_RISK' || highUtil || stats.outstanding > 0 && customer.status === 'ACTIVE' && util != null && util >= 0.9;

  return (
    <li
      data-testid="customer-row"
      className={cn(
        'group relative px-4 py-3.5 transition-colors hover:bg-muted/25',
        selected && 'bg-brand/5 ring-1 ring-inset ring-brand/30',
      )}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <div className="flex flex-wrap items-start gap-3 lg:flex-nowrap">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-xs font-bold text-brand"
            aria-hidden
          >
            {companyInitials(customer.companyName)}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-foreground">
                {customer.companyName}
              </span>
              <StatusBadge status={customer.status} />
              {atRisk && customer.status !== 'AT_RISK' && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Risk
                </span>
              )}
              {customer.status === 'AT_RISK' && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  At risk
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" />
                {customer.contactName}
              </span>
              {customer.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {customer.phone}
                </span>
              )}
              {customer.email && (
                <span className="inline-flex items-center gap-1 truncate">
                  <Mail className="h-3 w-3" />
                  {customer.email}
                </span>
              )}
              <span className="font-mono text-[11px]">{customer.customerCode}</span>
            </div>
          </div>
        </button>

        <div className="grid w-full grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:w-auto lg:min-w-[22rem] lg:grid-cols-4">
          <Metric cell label="Open orders" value={String(stats.openOrders)} />
          {canViewInvoices ? (
            <Metric cell label="Invoices" value={String(stats.invoiceCount)} />
          ) : (
            <Metric cell label="City" value={customer.city ?? '—'} />
          )}
          {canViewInvoices ? (
            <Metric
              cell
              label="Outstanding"
              value={
                stats.outstanding > 0
                  ? formatMoney(stats.outstanding, stats.currency ?? 'USD')
                  : '—'
              }
              tone={stats.outstanding > 0 ? 'warn' : undefined}
            />
          ) : (
            <Metric
              cell
              label="Credit"
              value={
                Number.isFinite(credit)
                  ? formatMoney(credit, 'USD')
                  : '—'
              }
            />
          )}
          <Metric
            cell
            label={canViewInvoices ? 'Utilization' : 'Updated'}
            value={
              canViewInvoices
                ? util != null
                  ? `${Math.round(util * 100)}%`
                  : Number.isFinite(credit) && credit > 0
                    ? '0%'
                    : '—'
                : formatRelativeTime(customer.updatedAt)
            }
            tone={highUtil ? 'warn' : undefined}
          />
        </div>

        <div className="hidden flex-col items-end gap-1 text-right text-xs lg:flex lg:w-28">
          <span className="font-mono font-medium tabular-nums text-foreground">
            {Number.isFinite(credit) ? formatMoney(credit, 'USD') : '—'}
          </span>
          <span className="text-muted-foreground" title={customer.updatedAt}>
            {formatRelativeTime(customer.updatedAt)}
          </span>
        </div>

        <div
          className="ml-auto flex shrink-0 items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={onOpen}>
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="sr-only">Open</span>
          </Button>
          {customer.phone && (
            <Button size="sm" variant="ghost" className="h-8 px-2" asChild>
              <a href={`tel:${customer.phone}`}>
                <Phone className="h-3.5 w-3.5" />
                <span className="sr-only">Call</span>
              </a>
            </Button>
          )}
          {customer.email && (
            <Button size="sm" variant="ghost" className="h-8 px-2" asChild>
              <a href={`mailto:${customer.email}`}>
                <Mail className="h-3.5 w-3.5" />
                <span className="sr-only">Email</span>
              </a>
            </Button>
          )}
          {canWrite && customer.status !== 'ARCHIVED' && (
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={onEdit}>
              <Edit2 className="h-3.5 w-3.5" />
              <span className="sr-only">Edit</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 px-2">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onOpen}>
                <Building2 className="mr-2 h-3.5 w-3.5" />
                Open account
              </DropdownMenuItem>
              {customer.phone && (
                <DropdownMenuItem asChild>
                  <a href={`tel:${customer.phone}`}>
                    <Phone className="mr-2 h-3.5 w-3.5" />
                    Call
                  </a>
                </DropdownMenuItem>
              )}
              {customer.email && (
                <DropdownMenuItem asChild>
                  <a href={`mailto:${customer.email}`}>
                    <Mail className="mr-2 h-3.5 w-3.5" />
                    Email
                  </a>
                </DropdownMenuItem>
              )}
              {canWrite && customer.status !== 'ARCHIVED' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit2 className="mr-2 h-3.5 w-3.5" />
                    Edit
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}

function Metric({
  label,
  value,
  tone,
  cell,
}: {
  label: string;
  value: string;
  tone?: 'warn';
  cell?: boolean;
}) {
  return (
    <div className={cn(cell && 'min-w-0')}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 truncate font-medium tabular-nums text-foreground',
          tone === 'warn' && 'text-warning',
        )}
      >
        {value}
      </p>
    </div>
  );
}
