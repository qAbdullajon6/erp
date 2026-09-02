'use client';

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/page-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCustomersList,
  useArchiveCustomer,
  type Customer,
  type CustomerSortField,
  type CustomerStatus,
  formatPaymentTerms,
  creditLimitLabel,
} from '@/lib/api/customers';
import { useCurrentUser } from '@/lib/api/auth';
import { CUSTOMER_WRITE_ROLES, INVOICE_READ_ROLES } from '@/lib/role-access';
import type { MembershipRole } from '@/lib/api/organizations';
import { ErrorState, EmptyState, ListSkeleton } from '@/components/shared/list-states';
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
  Archive,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit2,
  Eye,
  Mail,
  MoreHorizontal,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type CrmTab = 'all' | 'active' | 'high_value' | 'outstanding' | 'inactive' | 'archived';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

const AVATAR_CLASS = 'bg-brand/15 text-brand';

function compactPaymentTerms(terms: string, days?: number | null): string {
  switch (terms) {
    case 'DUE_ON_RECEIPT': return 'Due on receipt';
    case 'NET_7':  return 'Net  7';
    case 'NET_15': return 'Net 15';
    case 'NET_30': return 'Net 30';
    case 'NET_45': return 'Net 45';
    case 'NET_60': return 'Net 60';
    case 'NET_90': return 'Net 90';
    case 'CUSTOM': return days != null ? `Net ${days}` : 'Custom';
    default: return terms;
  }
}

function tabToQuery(tab: CrmTab): {
  status?: CustomerStatus;
  includeArchived?: boolean;
  sortBy?: CustomerSortField;
  sortOrder?: 'asc' | 'desc';
} {
  switch (tab) {
    case 'active':      return { status: 'ACTIVE', sortBy: 'companyName', sortOrder: 'asc' };
    case 'high_value':  return { status: 'ACTIVE', sortBy: 'creditLimit', sortOrder: 'desc' };
    case 'inactive':    return { status: 'INACTIVE', sortBy: 'updatedAt', sortOrder: 'desc' };
    case 'archived':    return { status: 'ARCHIVED', includeArchived: true, sortBy: 'updatedAt', sortOrder: 'desc' };
    case 'outstanding': return { includeArchived: false, sortBy: 'companyName', sortOrder: 'asc' };
    default:            return { includeArchived: false, sortBy: 'updatedAt', sortOrder: 'desc' };
  }
}

// ─── Inline pagination ────────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onLimitChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (p: number) => void;
  onLimitChange: (l: number) => void;
}) {
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * limit + 1;
  const to   = Math.min(safePage * limit, total);

  // Build page numbers (show up to 5, centred around current)
  const pages: (number | '…')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (safePage > 3) pages.push('…');
    for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) {
      pages.push(i);
    }
    if (safePage < totalPages - 2) pages.push('…');
    pages.push(totalPages);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3">
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{from}</span>
        {' '}to{' '}
        <span className="font-medium text-foreground">{to}</span>
        {' '}of{' '}
        <span className="font-medium text-foreground">{total}</span> customers
      </p>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage <= 1}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          {pages.map((p, i) =>
            p === '…' ? (
              <span key={`ellipsis-${i}`} className="flex h-8 w-8 items-center justify-center text-sm text-muted-foreground">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p as number)}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-medium transition-colors',
                  p === safePage
                    ? 'border-brand bg-brand text-brand-foreground'
                    : 'border-border hover:bg-muted',
                )}
              >
                {p}
              </button>
            ),
          )}

          <button
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <Select value={String(limit)} onValueChange={(v) => onLimitChange(Number(v))}>
          <SelectTrigger className="h-8 w-[100px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50].map((n) => (
              <SelectItem key={n} value={String(n)}>{n} per page</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-brand text-brand'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
            active ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Main list component ──────────────────────────────────────────────────────

export function CustomersList() {
  const navigate = useNavigate();
  const searchState = useSearch({ from: '/app/customers/' });
  const { data: currentUser } = useCurrentUser();
  const role = currentUser?.membership.role as MembershipRole | undefined;
  const canWrite = Boolean(role && CUSTOMER_WRITE_ROLES.includes(role));
  const canViewInvoices = Boolean(role && INVOICE_READ_ROLES.includes(role));

  const tab = (['all', 'active', 'high_value', 'outstanding', 'inactive', 'archived'].includes(
    searchState.tab as string,
  )
    ? searchState.tab
    : 'active') as CrmTab;

  const page   = searchState.page || 1;
  const search = searchState.search || '';
  const createOpen = Boolean(searchState.create);
  const [limit, setLimit] = useState(10);
  const tabQuery = tabToQuery(tab);
  const [localSearch, setLocalSearch] = useState(search);
  const [editing, setEditing] = useState<Customer | null>(null);

  const debouncedSearch = useDebouncedValue(localSearch, 300);
  useEffect(() => { setLocalSearch(search); }, [search]);
  useEffect(() => {
    if (debouncedSearch === search) return;
    navigate({ to: '/app/customers', search: (p) => ({ ...p, page: 1, search: debouncedSearch || undefined }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const listEnabled = tab !== 'outstanding';
  const { data, meta, loading, error, refetch } = useCustomersList(
    {
      page: listEnabled ? page : 1,
      limit: listEnabled ? limit : 200,
      search: search || undefined,
      status: tabQuery.status,
      includeArchived: tabQuery.includeArchived,
      sortBy: tabQuery.sortBy,
      sortOrder: tabQuery.sortOrder,
    },
    { enabled: true },
  );

  const relationships = useCustomerRelationshipIndex({ enabled: true, canViewInvoices });

  // Tab counts (limit:1 queries, just for .meta.total)
  const allCount      = useCustomersList({ limit: 1, includeArchived: false });
  const activeCount   = useCustomersList({ status: 'ACTIVE', limit: 1 });
  const inactiveCount = useCustomersList({ status: 'INACTIVE', limit: 1 });
  const archivedCount = useCustomersList({ status: 'ARCHIVED', includeArchived: true, limit: 1 });
  const highValCount  = useCustomersList({ status: 'ACTIVE', sortBy: 'creditLimit', sortOrder: 'desc', limit: 1 });

  const displayRows = useMemo(() => {
    if (tab !== 'outstanding') return data;
    return data.filter((c) => relationships.outstandingCustomerIds.has(c.id));
  }, [tab, data, relationships.outstandingCustomerIds]);

  const outstandingCount = useMemo(
    () => [...data].filter((c) => relationships.outstandingCustomerIds.has(c.id)).length,
    [data, relationships.outstandingCustomerIds],
  );

  const setTab = (next: CrmTab) => {
    navigate({ to: '/app/customers', search: { page: 1, tab: next } });
  };

  const handleExport = () => {
    if (!displayRows.length) { toast.error('Nothing to export'); return; }
    const rows = displayRows.map((c) => {
      const stats = relationships.getStats(c.id);
      return {
        code: c.customerCode, company: c.companyName,
        contact: c.contactName, email: c.email ?? '', phone: c.phone ?? '',
        status: c.status, creditLimit: c.creditLimit,
        openOrders: stats.openOrders, invoices: stats.invoiceCount,
        outstanding: stats.outstanding, updatedAt: c.updatedAt,
      };
    });
    downloadCsv(`customers-${page}.csv`, toCsv(rows, [
      { key: 'code', label: 'Code' }, { key: 'company', label: 'Company' },
      { key: 'contact', label: 'Contact' }, { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' }, { key: 'status', label: 'Status' },
      { key: 'creditLimit', label: 'Credit limit' }, { key: 'openOrders', label: 'Open orders' },
      { key: 'invoices', label: 'Invoices' }, { key: 'outstanding', label: 'Outstanding' },
      { key: 'updatedAt', label: 'Updated' },
    ]));
    toast.success('Exported');
  };

  return (
    <div className="space-y-5" data-testid="customers-page">
      <PageHeader
        title="Customers"
        subtitle="Manage your customers and business relationships"
        action={
          <>
            <Button size="sm" variant="outline" onClick={handleExport} disabled={!displayRows.length}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export
            </Button>
            {canWrite && (
              <Button
                size="sm"
                className="bg-gradient-brand text-brand-foreground hover:opacity-90"
                onClick={() => navigate({ to: '/app/customers', search: (p) => ({ ...p, create: true }) })}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New Customer
              </Button>
            )}
          </>
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-0 overflow-x-auto border-b border-border">
        <TabButton label="All"               count={allCount.meta.total}      active={tab === 'all'}         onClick={() => setTab('all')} />
        <TabButton label="Active"            count={activeCount.meta.total}   active={tab === 'active'}      onClick={() => setTab('active')} />
        <TabButton label="High Value"        count={highValCount.meta.total}  active={tab === 'high_value'}  onClick={() => setTab('high_value')} />
        {canViewInvoices && (
          <TabButton label="Outstanding Balance" count={outstandingCount}     active={tab === 'outstanding'} onClick={() => setTab('outstanding')} />
        )}
        <TabButton label="Inactive"          count={inactiveCount.meta.total} active={tab === 'inactive'}    onClick={() => setTab('inactive')} />
        <TabButton label="Archived"          count={archivedCount.meta.total} active={tab === 'archived'}    onClick={() => setTab('archived')} />
      </div>

      {/* Search */}
      <div className="max-w-lg">
        <Input
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search by company name, contact, email, phone…"
          className="h-9"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-surface">
        {loading && <ListSkeleton rows={8} label="Loading customers" />}
        {error && !loading && <ErrorState message={error} onRetry={() => refetch()} />}

        {!loading && !error && displayRows.length === 0 && (
          <EmptyState
            title={search ? 'No customers match' : 'No customers yet'}
            description={search ? 'Try a different search term or clear filters.' : 'Add an account before creating orders.'}
            action={
              canWrite ? (
                <Button variant="outline" size="sm"
                  onClick={() => navigate({ to: '/app/customers', search: (p) => ({ ...p, create: true }) })}>
                  New Customer
                </Button>
              ) : undefined
            }
          />
        )}

        {!loading && !error && displayRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="customers-table">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Payment Terms
                  </th>
                  {canViewInvoices && (
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Outstanding
                    </th>
                  )}
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Open Orders
                  </th>
                  {canViewInvoices && (
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Invoices
                    </th>
                  )}
                  {canViewInvoices && (
                    <th className="w-32 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Utilization
                    </th>
                  )}
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Added
                  </th>
                  <th className="w-0 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {displayRows.map((customer) => (
                  <CustomerRow
                    key={customer.id}
                    customer={customer}
                    stats={relationships.getStats(customer.id)}
                    canWrite={canWrite}
                    canViewInvoices={canViewInvoices}
                    onOpen={() => navigate({ to: '/app/customers/$customerId', params: { customerId: customer.id } })}
                    onEdit={() => setEditing(customer)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {tab !== 'outstanding' && !loading && !error && meta.total > 0 && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          limit={limit}
          onPageChange={(p) => navigate({ to: '/app/customers', search: (prev) => ({ ...prev, page: p }) })}
          onLimitChange={(l) => { setLimit(l); navigate({ to: '/app/customers', search: (p) => ({ ...p, page: 1 }) }); }}
        />
      )}

      {canWrite && (
        <CustomersCreateSheet
          open={createOpen}
          onOpenChange={(open) =>
            navigate({ to: '/app/customers', search: (p) => ({ ...p, create: open ? true : undefined }) })
          }
          onCreated={(c) => navigate({ to: '/app/customers/$customerId', params: { customerId: c.id } })}
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

// ─── Table row ────────────────────────────────────────────────────────────────

function CustomerRow({
  customer,
  stats,
  canWrite,
  canViewInvoices,
  onOpen,
  onEdit,
}: {
  customer: Customer;
  stats: ReturnType<ReturnType<typeof useCustomerRelationshipIndex>['getStats']>;
  canWrite: boolean;
  canViewInvoices: boolean;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const { archive } = useArchiveCustomer();
  const util = creditUtilization(customer.creditLimit, stats.outstanding);
  const highUtil = util != null && util >= 0.8;

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Archive "${customer.companyName}"?`)) return;
    try {
      await archive(customer.id);
      toast.success('Customer archived');
    } catch {
      toast.error('Failed to archive customer');
    }
  };

  return (
    <tr
      className="group cursor-pointer transition-colors hover:bg-muted/30"
      onClick={onOpen}
      data-testid="customer-row"
    >
      {/* Customer */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
              AVATAR_CLASS,
            )}
            aria-hidden
          >
            {companyInitials(customer.companyName)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{customer.companyName}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{customer.customerCode}</p>
          </div>
        </div>
      </td>

      {/* Contact */}
      <td className="px-4 py-3">
        <p className="truncate text-sm text-foreground">{customer.contactName ?? '—'}</p>
        <p className="truncate text-xs text-muted-foreground">{customer.email ?? '—'}</p>
      </td>

      {/* Payment Terms */}
      <td className="px-4 py-3">
        <span
          className={cn(
            'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
            customer.paymentTerms === 'DUE_ON_RECEIPT'
              ? 'border-green-400/30 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300'
              : 'border-border bg-muted/60 text-foreground',
          )}
        >
          {compactPaymentTerms(customer.paymentTerms, customer.paymentTermsDays)}
        </span>
      </td>

      {/* Outstanding */}
      {canViewInvoices && (
        <td className="px-4 py-3 text-right">
          {stats.outstanding > 0 ? (
            <span className="font-medium tabular-nums text-amber-600 dark:text-amber-400">
              {formatMoney(stats.outstanding, stats.currency ?? 'USD')}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      )}

      {/* Open Orders */}
      <td className="px-4 py-3 text-right">
        <span className={cn('font-medium tabular-nums', stats.openOrders > 0 ? 'text-brand' : 'text-muted-foreground')}>
          {stats.openOrders}
        </span>
      </td>

      {/* Invoices */}
      {canViewInvoices && (
        <td className="px-4 py-3 text-right">
          <span className="tabular-nums text-muted-foreground">{stats.invoiceCount}</span>
        </td>
      )}

      {/* Utilization */}
      {canViewInvoices && (
        <td className="px-4 py-3">
          {util != null ? (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full transition-all', highUtil ? 'bg-amber-500' : 'bg-brand')}
                  style={{ width: `${Math.min(100, Math.round(util * 100))}%` }}
                />
              </div>
              <span className={cn('tabular-nums text-xs', highUtil ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                {Math.round(util * 100)}%
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      )}

      {/* Added */}
      <td className="px-4 py-3 text-right text-xs text-muted-foreground">
        {formatRelativeTime(customer.createdAt)}
      </td>

      {/* Actions (visible on hover) */}
      <td
        className="px-3 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onOpen}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="View account"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>

          {customer.email && (
            <a
              href={`mailto:${customer.email}`}
              onClick={(e) => e.stopPropagation()}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Send email"
            >
              <Mail className="h-3.5 w-3.5" />
            </a>
          )}

          {canWrite && customer.status !== 'ARCHIVED' && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Edit customer"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          )}

          {canWrite && customer.status !== 'ARCHIVED' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  onClick={handleArchive}
                  className="text-xs text-destructive focus:text-destructive"
                >
                  <Archive className="mr-2 h-3.5 w-3.5" />
                  Archive Customer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </td>
    </tr>
  );
}
