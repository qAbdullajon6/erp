'use client';

import { useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { StatusBadge, statusLabel } from '@/components/shared/status-badge';
import { CustomersEditSheet } from '@/components/customers/customers-edit-sheet';
import { PortalAccessPanel } from '@/components/customers/portal-access-panel';
import { creditUtilization } from '@/components/customers/customer-relationship-stats';
import {
  useCustomerDetail,
  useArchiveCustomer,
  useRestoreCustomer,
  formatPaymentTerms,
  creditLimitLabel,
} from '@/lib/api/customers';
import { useOrdersList, type Order } from '@/lib/api/orders';
import { useInvoicesQuery, type Invoice } from '@/lib/api/invoices';
import { useDispatches } from '@/lib/hooks/use-dispatches';
import { useCurrentUser } from '@/lib/api/auth';
import {
  CUSTOMER_WRITE_ROLES,
  INVOICE_READ_ROLES,
  ORDER_WRITE_ROLES,
} from '@/lib/role-access';
import type { MembershipRole } from '@/lib/api/organizations';
import { describeError } from '@/lib/api/describe-error';
import { useSetPageLeaf } from '@/lib/page-title-context';
import { formatMoney, formatDate, formatDateTime, formatRelativeTime } from '@/lib/format';
import { countryName } from '@/lib/countries';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Archive,
  ArrowRight,
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit2,
  ExternalLink,
  Mail,
  MapPin,
  MoreHorizontal,
  Package,
  Phone,
  Plus,
  Receipt,
  RotateCcw,
  StickyNote,
  TrendingUp,
  Truck,
  User,
  Wallet,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface CustomerDetailProps {
  customerId: string;
}

const OPEN_ORDER = new Set(['DRAFT', 'PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT']);
const ACTIVE_DISPATCH = new Set([
  'ASSIGNED',
  'EN_ROUTE_TO_PICKUP',
  'AT_PICKUP',
  'IN_TRANSIT',
]);

const RAIL_BTN =
  'flex h-8 w-full items-center gap-2 px-2.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-50';

type ActivityKind = 'order' | 'invoice' | 'dispatch' | 'payment' | 'note' | 'account';

const ACTIVITY_STYLE: Record<ActivityKind, { icon: typeof Package; className: string }> = {
  order: { icon: Package, className: 'bg-brand/15 text-brand' },
  invoice: { icon: Receipt, className: 'bg-warning/15 text-warning' },
  dispatch: { icon: Truck, className: 'bg-success/15 text-success' },
  payment: { icon: Banknote, className: 'bg-success/20 text-success' },
  note: { icon: StickyNote, className: 'bg-muted text-muted-foreground' },
  account: { icon: CheckCircle2, className: 'bg-muted text-muted-foreground' },
};

function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function invoiceCrmLabel(status: Invoice['status']): { label: string; className: string } {
  if (status === 'PAID') return { label: 'Paid', className: 'bg-success/15 text-success' };
  if (status === 'OVERDUE') return { label: 'Overdue', className: 'bg-destructive/15 text-destructive' };
  if (status === 'SENT' || status === 'PARTIALLY_PAID') return { label: 'Open', className: 'bg-warning/15 text-warning' };
  if (status === 'CANCELLED') return { label: 'Cancelled', className: 'bg-muted text-muted-foreground' };
  return { label: statusLabel(status), className: 'bg-muted text-muted-foreground' };
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function CustomerDetail({ customerId }: CustomerDetailProps) {
  const navigate = useNavigate();
  const { data: currentUser } = useCurrentUser();
  const role = currentUser?.membership.role as MembershipRole | undefined;
  const canWrite = Boolean(role && CUSTOMER_WRITE_ROLES.includes(role));
  const canViewInvoices = Boolean(role && INVOICE_READ_ROLES.includes(role));
  const canCreateOrder = Boolean(role && ORDER_WRITE_ROLES.includes(role));

  const { data: customer, loading, error, refetch } = useCustomerDetail(customerId);
  const { archive, loading: archiving } = useArchiveCustomer();
  const { restore, loading: restoring } = useRestoreCustomer();

  // 100, not 50 — the max page size Orders/Invoices' own list endpoints allow
  // (list-orders-query.dto.ts / list-invoices-query.dto.ts), so this account's
  // timeline/financials miss as little as the API can give in one request.
  const ordersQuery = useOrdersList({
    customerId,
    limit: 100,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  const invoicesQuery = useInvoicesQuery(
    { customerId, limit: 100, sortBy: 'createdAt', sortOrder: 'desc' },
    canViewInvoices,
  );
  // Filtered server-side by this customer's dispatches (via the order relation
  // — GET /dispatches?customerId=), not the org's 100 most recent dispatches
  // filtered client-side by this customer's most recent 100 orders. The old
  // approach silently dropped a customer's dispatches once the org had more
  // than 100 dispatches total, regardless of how few belonged to THIS account.
  const dispatchesQuery = useDispatches(1, 100, { customerId });

  const [editOpen, setEditOpen] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  const orders = ordersQuery.data;
  const invoices = useMemo(() => invoicesQuery.data?.items ?? [], [invoicesQuery.data]);
  const relatedDispatches = useMemo(() => dispatchesQuery.data ?? [], [dispatchesQuery.data]);

  const openOrders = useMemo(
    () => orders.filter((o) => OPEN_ORDER.has(o.status)),
    [orders],
  );

  const activeDispatches = useMemo(
    () => relatedDispatches.filter((d) => ACTIVE_DISPATCH.has(d.status)),
    [relatedDispatches],
  );

  const financial = useMemo(() => {
    const year = new Date().getFullYear();
    let outstanding = 0;
    let paid = 0;
    let revenueYtd = 0;
    let currency = 'USD';

    for (const o of orders) {
      const p = Number(o.price);
      if (!Number.isFinite(p)) continue;
      currency = o.currency || currency;
      if (new Date(o.createdAt).getFullYear() === year) revenueYtd += p;
    }

    for (const inv of invoices) {
      currency = inv.currency || currency;
      const bal = Number(inv.balanceDue);
      const pay = Number(inv.paidAmount ?? 0);
      if (Number.isFinite(bal) && bal > 0) outstanding += bal;
      if (Number.isFinite(pay)) paid += pay;
    }

    return { outstanding, paid, revenueYtd, currency, year };
  }, [orders, invoices]);

  const creditLimit = customer?.creditLimit != null ? parseFloat(customer.creditLimit) : null;
  const util = customer ? creditUtilization(customer.creditLimit, financial.outstanding) : null;

  const activity = useMemo(() => {
    if (!customer) return [];
    const items: {
      id: string;
      at: string;
      title: string;
      detail?: string;
      kind: ActivityKind;
    }[] = [];

    for (const o of orders.slice(0, 10)) {
      items.push({
        id: `order-${o.id}`,
        at: o.createdAt,
        title: `Order ${o.orderNumber}`,
        detail: `${o.pickupCity} → ${o.deliveryCity} · ${statusLabel(o.status)}`,
        kind: 'order',
      });
    }
    for (const inv of invoices.slice(0, 10)) {
      items.push({
        id: `inv-${inv.id}`,
        at: inv.createdAt,
        title: `Invoice ${inv.invoiceNumber}`,
        detail: `${statusLabel(inv.status)} · ${formatMoney(inv.totalAmount, inv.currency)}`,
        kind: 'invoice',
      });
      const paidAmt = Number(inv.paidAmount ?? 0);
      if (paidAmt > 0) {
        items.push({
          id: `pay-${inv.id}`,
          at: inv.updatedAt,
          title: `Payment on ${inv.invoiceNumber}`,
          detail: formatMoney(paidAmt, inv.currency),
          kind: 'payment',
        });
      }
    }
    for (const d of relatedDispatches.slice(0, 8)) {
      items.push({
        id: `disp-${d.id}`,
        at: d.updatedAt,
        title: `Dispatch ${d.dispatchNumber}`,
        detail: statusLabel(d.status),
        kind: 'dispatch',
      });
    }
    if (customer.internalNotes) {
      items.push({
        id: `notes-${customer.id}`,
        at: customer.updatedAt,
        title: 'Internal notes on file',
        detail: customer.internalNotes.slice(0, 120),
        kind: 'note',
      });
    }
    items.push({
      id: `created-${customer.id}`,
      at: customer.createdAt,
      title: 'Account created',
      detail: 'Customer account was created',
      kind: 'account',
    });
    return items
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 24);
  }, [customer, orders, invoices, relatedDispatches]);

  // Set the topbar breadcrumb leaf (clears on unmount automatically)
  useSetPageLeaf(customer?.customerCode ?? null);

  if (loading) return <LoadingState label="Loading customer…" />;
  if (error || !customer) {
    return (
      <div className="space-y-4">
        <Button onClick={() => navigate({ to: '/app/customers' })} variant="ghost" className="gap-2">
          Customers
        </Button>
        <ErrorState message={error || 'Customer not found'} onRetry={() => refetch()} />
      </div>
    );
  }

  const handleArchive = async () => {
    try {
      await archive(customerId);
      toast.success('Customer archived');
      setShowArchive(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to archive customer'));
    }
  };

  const handleRestore = async () => {
    try {
      await restore(customerId);
      toast.success('Customer restored');
    } catch (err) {
      toast.error(describeError(err, 'Failed to restore customer'));
    }
  };

  const countryDisplay = countryName(customer.country);
  const locationLabel = [customer.city, countryDisplay].filter(Boolean).join(', ');
  const postalAndLocation = [customer.postalCode, customer.city, countryDisplay]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-3 pb-8">

      {/* ── Customer Header Card ── */}
      <div className="overflow-hidden rounded-xl border border-border/80 bg-surface shadow-sm px-5 py-4 space-y-3">
        {/* Identity row + actions */}
        <div className="">
          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* Avatar + name */}
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-base font-bold text-brand">
                {companyInitials(customer.companyName)}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-foreground">
                    {customer.companyName}
                  </h1>
                  <StatusBadge status={customer.status} />
                  {util != null && util >= 0.8 && (
                    <Badge variant="outline" className="border-warning/40 text-[10px] text-warning">
                      High utilization
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="font-mono text-xs">{customer.customerCode}</span>
                  {customer.email && (
                    <a
                      href={`mailto:${customer.email}`}
                      className="inline-flex items-center gap-1.5 hover:text-brand"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {customer.email}
                    </a>
                  )}
                  {customer.phone && (
                    <a
                      href={`tel:${customer.phone}`}
                      className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {customer.phone}
                    </a>
                  )}
                  {locationLabel && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {locationLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Backend requires status === ACTIVE to create an order for this
                  customer (orders.service.ts assertCustomerSelectable) — AT_RISK
                  and INACTIVE are rejected too, not just ARCHIVED, so the button
                  must not be offered for those either. */}
              {canCreateOrder && customer.status === 'ACTIVE' && (
                <Button
                  size="sm"
                  className="bg-gradient-brand text-brand-foreground hover:opacity-90"
                  onClick={() =>
                    navigate({ to: '/app/orders', search: { create: true, customerId } })
                  }
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  New Order
                </Button>
              )}
              {canWrite && customer.status !== 'ARCHIVED' && (
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                  <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
              {canWrite && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="px-2">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {customer.email && (
                      <>
                        <DropdownMenuItem asChild>
                          <a href={`mailto:${customer.email}`}>
                            <Mail className="mr-2 h-3.5 w-3.5" />
                            Email Customer
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    {customer.status === 'ARCHIVED' ? (
                      <DropdownMenuItem
                        onClick={() => void handleRestore()}
                        disabled={restoring}
                      >
                        <RotateCcw className="mr-2 h-3.5 w-3.5" />
                        Restore Customer
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => setShowArchive(true)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Archive className="mr-2 h-3.5 w-3.5" />
                        Archive Customer
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>

        {/* Info strip — four labeled metric cells separated by dividers */}
        <div className="flex flex-wrap gap-5">
          <div className="flex divide-x divide-border/60 border border-border/60 py-2 rounded-lg">
            <div className="min-w-[130px] px-3 py-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Credit limit
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                {creditLimitLabel(customer.creditLimit) ??
                  (creditLimit != null
                    ? formatMoney(creditLimit, financial.currency)
                    : 'Unlimited')}
              </p>
            </div>
            <div className="min-w-[130px] px-3 py-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Payment terms
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {formatPaymentTerms(customer.paymentTerms, customer.paymentTermsDays)}
              </p>
            </div>
          </div>

          <div className="min-w-[130px] border border-border/60 rounded-lg px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Outstanding
            </p>
            <p
              className={cn(
                'mt-1 font-mono text-sm font-semibold',
                canViewInvoices && financial.outstanding > 0
                  ? 'text-warning'
                  : 'text-foreground',
              )}
            >
              {canViewInvoices ? formatMoney(financial.outstanding, financial.currency) : '—'}
            </p>
          </div>
          <div className="min-w-[130px] border border-border/60 rounded-lg px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Currency
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">
              {customer.currency || financial.currency}
            </p>
          </div>
        </div>

        {/* KPI strip — inside the same header card */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 ">
          {([
            {
              label: 'Open Orders',
              value: String(openOrders.length),
              icon: Package,
              iconColor: 'bg-orange-500/15 text-orange-500',
              tone: undefined as 'warn' | undefined,
              hint: undefined as string | undefined,
            },
            {
              label: 'Active Dispatches',
              value: String(activeDispatches.length),
              icon: Truck,
              iconColor: 'bg-violet-500/15 text-violet-500',
              tone: undefined,
              hint: undefined,
            },
            {
              label: 'Outstanding',
              value: canViewInvoices ? formatMoney(financial.outstanding, financial.currency) : '—',
              icon: DollarSign,
              iconColor: 'bg-blue-500/15 text-blue-500',
              tone: (financial.outstanding > 0 ? 'warn' : undefined) as 'warn' | undefined,
              hint: undefined,
            },
            {
              label: `Revenue ${financial.year}`,
              value: formatMoney(financial.revenueYtd, financial.currency),
              icon: TrendingUp,
              iconColor: 'bg-teal-500/15 text-teal-500',
              tone: undefined,
              hint: 'From loaded orders this year',
            },
          ] as const).map(({ label, value, icon: Icon, iconColor, tone, hint }) => (
            <div key={label} className="bg-surface px-3 pt-2 py-0.5 rounded-xl border border-border/60">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    iconColor,
                  )}
                >
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <p
                    className={cn(
                      'font-mono text-xl font-semibold tabular-nums tracking-tight',
                      tone === 'warn' ? 'text-warning' : 'text-foreground',
                    )}
                  >
                    {value}
                  </p>
                  {hint && (
                    <p className="text-[11px] text-muted-foreground">{hint}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main content + right sidebar ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,18%)]">

        {/* Main content */}
        <div className="space-y-3">

          {/* Contact + Address */}
          <div id="section-contact" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SectionCard title="Contact" icon={User}>
              <div className="rounded-lg border border-border/50 bg-muted/15 p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Primary contact
                </p>
                {customer.contactName ? (
                  <p className="mt-1.5 text-sm font-semibold">{customer.contactName}</p>
                ) : null}
                {customer.phone ? (
                  <a
                    href={`tel:${customer.phone}`}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                  >
                    <Phone className="h-3 w-3" />
                    {customer.phone}
                  </a>
                ) : null}
                {customer.email ? (
                  <a
                    href={`mailto:${customer.email}`}
                    className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-brand"
                  >
                    <Mail className="h-3 w-3" />
                    {customer.email}
                  </a>
                ) : null}
                {!customer.contactName && !customer.phone && !customer.email && (
                  <p className="mt-1.5 text-xs text-muted-foreground">No contact information</p>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Address" icon={MapPin}>
              <div className="rounded-lg border border-border/50 bg-muted/15 p-3.5">
                <p className="text-sm text-foreground">
                  {customer.address || (
                    <span className="text-muted-foreground">No street address</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{postalAndLocation || '—'}</p>
                {customer.taxId && (
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                    Tax ID {customer.taxId}
                  </p>
                )}
              </div>
            </SectionCard>
          </div>

          {/* Orders */}
          <div id="section-orders">
            <SectionCard
              title="Orders"
              icon={Package}
              action={
                <Link
                  to="/app/orders"
                  search={{}}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                >
                  View all orders
                  <ArrowRight className="h-3 w-3" />
                </Link>
              }
            >
              {/* The table shell always renders — even with zero orders the
                  columns stay visible, so the section reads as a table that is
                  simply waiting for its first row rather than as a placeholder
                  card. */}
              {ordersQuery.loading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="pb-2.5 pr-3 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Amount
                        </th>
                        <th className="pb-2.5 pr-3 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Created
                        </th>
                        <th className="pb-2.5 pr-3 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Order
                        </th>
                        <th className="pb-2.5 pr-3 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Status
                        </th>
                        <th className="pb-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Route
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {orders.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="pt-8 pb-3 text-center">
                            <p className="text-sm font-medium text-foreground">No orders yet</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Orders for this customer will appear here.
                            </p>
                            {canCreateOrder && customer.status === 'ACTIVE' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-3 text-brand border-brand/40 hover:text-brand hover:bg-brand/10"
                                onClick={() =>
                                  navigate({ to: '/app/orders', search: { create: true, customerId } })
                                }
                              >
                                <Plus className="mr-1.5 h-3.5 w-3.5" />
                                New Order
                              </Button>
                            )}
                          </td>
                        </tr>
                      ) : (
                        orders.slice(0, 8).map((order) => (
                        <tr key={order.id} className="group transition-colors hover:bg-muted/20">
                          <td className="py-2.5 pr-3">
                            <span className="font-mono text-xs font-semibold tabular-nums">
                              {formatMoney(order.price, order.currency)}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-[11px] text-muted-foreground">
                            {formatDate(order.createdAt)}
                          </td>
                          <td className="py-2.5 pr-3">
                            <Link
                              to="/app/orders/$orderId"
                              params={{ orderId: order.id }}
                              className="font-mono text-xs font-semibold text-brand hover:underline"
                            >
                              {order.orderNumber}
                            </Link>
                          </td>
                          <td className="py-2.5 pr-3">
                            <StatusBadge status={order.status} />
                          </td>
                          <td className="py-2.5">
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              {order.pickupCity}
                              <ArrowRight className="h-3 w-3 shrink-0" />
                              {order.deliveryCity}
                            </span>
                          </td>
                        </tr>
                        ))
                        )}
                      </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>

          {/* Dispatches + Invoices */}
          <div className={cn('grid grid-cols-1 gap-3', canViewInvoices && 'sm:grid-cols-2')}>
            <div id="section-dispatches">
              <SectionCard
                title="Dispatches"
                icon={Truck}
                action={
                  <Link
                    to="/app/dispatches"
                    search={{}}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                  >
                    View all
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              >
                {dispatchesQuery.loading ? (
                  <Skeleton className="h-16 w-full" />
                ) : relatedDispatches.length === 0 ? (
                  <EmptyState
                    icon={Truck}
                    title="No linked dispatches"
                    description="Dispatches linked to this customer will appear here."
                    compact
                  />
                ) : (
                  <ul className="divide-y divide-border/40">
                    {relatedDispatches.slice(0, 6).map((d) => (
                      <li key={d.id}>
                        <Link
                          to="/app/dispatches/$dispatchId"
                          params={{ dispatchId: d.id }}
                          className="flex items-center justify-between gap-3 py-2.5 hover:text-brand"
                        >
                          <div>
                            <p className="font-mono text-xs font-semibold">{d.dispatchNumber}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {d.order?.pickupCity} → {d.order?.deliveryCity}
                            </p>
                          </div>
                          <StatusBadge status={d.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>

            {canViewInvoices && (
              <div id="section-invoices">
                <SectionCard
                  title="Invoices"
                  icon={Receipt}
                  action={
                    <Link
                      to="/app/finance"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                    >
                      View all
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  }
                >
                  {invoicesQuery.isPending ? (
                    <Skeleton className="h-16 w-full" />
                  ) : invoices.length === 0 ? (
                    <EmptyState
                      icon={Receipt}
                      title="No invoices"
                      description="Invoices for this customer will appear here."
                      compact
                    />
                  ) : (
                    <ul className="divide-y divide-border/40">
                      {invoices.slice(0, 6).map((inv) => {
                        const crm = invoiceCrmLabel(inv.status);
                        return (
                          <li
                            key={inv.id}
                            className="flex items-center justify-between gap-3 py-2.5"
                          >
                            <div>
                              <p className="font-mono text-xs font-semibold">
                                {inv.invoiceNumber}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {formatDate(inv.issueDate)}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <p className="font-mono text-xs font-semibold tabular-nums">
                                {formatMoney(inv.totalAmount, inv.currency)}
                              </p>
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                  crm.className,
                                )}
                              >
                                {crm.label}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </SectionCard>
              </div>
            )}
          </div>

          {/* Financial Summary + Activity — side by side once the viewport is
              wide enough (matches the Dispatches/Invoices pairing above).
              Both cards stretch to EQUAL height: grid cells stretch by default
              and `h-full` carries that height into each card, so the pair
              reads as one balanced row instead of ragged bottoms. */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div id="section-financial">
              <SectionCard title="Financial Summary" icon={Wallet} className="h-full">
                <div className="flex flex-wrap gap-2">
                  <MetricCard
                    label="Revenue"
                    value={formatMoney(financial.revenueYtd, financial.currency)}
                    tone="brand"
                  />
                {canViewInvoices && (
                  <MetricCard
                    label="Outstanding"
                    value={formatMoney(financial.outstanding, financial.currency)}
                    tone="warn"
                  />
                )}
                {canViewInvoices && (
                  <MetricCard
                    label="Paid"
                    value={formatMoney(financial.paid, financial.currency)}
                    tone="good"
                  />
                )}
                  <MetricCard
                    label="Credit"
                    value={
                      creditLimitLabel(customer?.creditLimit) ??
                      (creditLimit != null
                        ? formatMoney(creditLimit, financial.currency)
                        : 'Unlimited')
                    }
                    tone="muted"
                  />
                </div>
                <dl className="mt-4 grid grid-cols-1 gap-y-2 border-t border-border/50 pt-4 text-sm sm:grid-cols-4 lg:grid-cols-2 2xl:grid-cols-4">
                  <div className="flex gap-1 flex flex-col">
                    <dt className="w-36 shrink-0 text-muted-foreground">Payment terms</dt>
                    <dd className="font-medium">
                      {formatPaymentTerms(customer.paymentTerms, customer.paymentTermsDays)}
                    </dd>
                  </div>
                  <div className="flex gap-3 flex flex-col">
                    <dt className="w-36 shrink-0 text-muted-foreground">Credit utilization</dt>
                    <dd className="font-medium">
                      {util != null ? `${Math.round(util * 100)}%` : '—'}
                    </dd>
                  </div>
                  <div className="flex gap-3 flex flex-col">
                    <dt className="w-36 shrink-0 text-muted-foreground">Billing currency</dt>
                    <dd className="font-mono font-semibold">
                      {customer.currency || financial.currency}
                    </dd>
                  </div>
                  <div className="flex gap-3 flex flex-col">
                    <dt className="w-36 shrink-0 text-muted-foreground">Last payment</dt>
                    <dd className="font-medium text-muted-foreground">—</dd>
                  </div>
                </dl>
              </SectionCard>
            </div>

            {/* Activity / Timeline */}
            <div id="section-activity">
              <SectionCard title="Activity" icon={Clock} className="h-full">
                {activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {activity.map((item) => {
                      const style = ACTIVITY_STYLE[item.kind];
                      const Icon = style.icon;
                      return (
                        <li key={item.id} className="flex gap-3">
                          <span
                            className={cn(
                              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                              style.className,
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="text-sm font-medium text-foreground">{item.title}</p>
                              <span
                                className="text-[11px] text-muted-foreground"
                                title={formatDateTime(item.at)}
                              >
                                {formatRelativeTime(item.at)}
                              </span>
                            </div>
                            {item.detail && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SectionCard>
            </div>
          </div>

          {/* Notes */}
          <SectionCard
            title="Notes"
            icon={StickyNote}
            action={
              canWrite && customer.status !== 'ARCHIVED' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setEditOpen(true)}
                >
                  <Edit2 className="mr-1 h-3 w-3" />
                  Edit
                </Button>
              ) : undefined
            }
          >
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Internal
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {customer.internalNotes || 'No internal notes.'}
                </p>
              </div>
              {customer.deliveryNotes && (
                <div className="rounded-lg border border-border/50 bg-muted/15 px-3.5 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Delivery notes
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm">{customer.deliveryNotes}</p>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Customer Portal */}
          {canWrite && (
            <SectionCard title="Customer Portal" icon={Building2}>
              <PortalAccessPanel customerId={customerId} embedded />
            </SectionCard>
          )}

          {/* Coming soon */}
          <div className="rounded-xl border border-dashed border-border/40 px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              Coming soon
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground/80">
              Recent emails, calls, and attachments will appear here when those APIs are available.
            </p>
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <aside className="rounded-xl border border-border/60 bg-muted/10 lg:sticky lg:top-4 lg:self-start">
          <div className="space-y-3 p-3 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">

            {/* Quick actions */}
            <div>
              <h3 className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Quick actions
              </h3>
              <div className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60 bg-surface">
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className={RAIL_BTN}>
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </a>
                )}
                {customer.phone && (
                  <a href={`tel:${customer.phone}`} className={RAIL_BTN}>
                    <Phone className="h-3.5 w-3.5" />
                    Call
                  </a>
                )}
                {canCreateOrder && customer.status === 'ACTIVE' && (
                  <button
                    type="button"
                    className={RAIL_BTN}
                    onClick={() =>
                      navigate({ to: '/app/orders', search: { create: true, customerId } })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New Order
                  </button>
                )}
                {canWrite && customer.status !== 'ARCHIVED' && (
                  <button
                    type="button"
                    className={RAIL_BTN}
                    onClick={() => setEditOpen(true)}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
                {canWrite && customer.status !== 'ARCHIVED' && (
                  <button
                    type="button"
                    className={cn(RAIL_BTN, 'text-destructive hover:bg-destructive/10')}
                    onClick={() => setShowArchive(true)}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive
                  </button>
                )}
                {canWrite && customer.status === 'ARCHIVED' && (
                  <button
                    type="button"
                    className={RAIL_BTN}
                    disabled={restoring}
                    onClick={() => void handleRestore()}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore
                  </button>
                )}
              </div>
            </div>

            {/* Account info */}
            <div>
              <h3 className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Account
              </h3>
              <dl className="space-y-2 rounded-lg border border-border/60 bg-surface px-3 py-2.5 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <StatusBadge status={customer.status} />
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Customer ID</dt>
                  <dd className="font-mono text-xs">{customer.customerCode}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="tabular-nums">{formatDate(customer.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Updated</dt>
                  <dd className="tabular-nums">{formatRelativeTime(customer.updatedAt)}</dd>
                </div>
              </dl>
            </div>

            {/* Jump to */}
            <div>
              <h3 className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Jump to
              </h3>
              <div className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60 bg-surface">
                <button
                  type="button"
                  className={RAIL_BTN}
                  onClick={() => scrollTo('section-contact')}
                >
                  <User className="h-3.5 w-3.5" />
                  Contact
                </button>
                <button
                  type="button"
                  className={RAIL_BTN}
                  onClick={() => scrollTo('section-orders')}
                >
                  <Package className="h-3.5 w-3.5" />
                  Orders
                </button>
                <button
                  type="button"
                  className={RAIL_BTN}
                  onClick={() => scrollTo('section-dispatches')}
                >
                  <Truck className="h-3.5 w-3.5" />
                  Dispatches
                </button>
                {canViewInvoices && (
                  <button
                    type="button"
                    className={RAIL_BTN}
                    onClick={() => scrollTo('section-invoices')}
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    Invoices
                  </button>
                )}
                <button
                  type="button"
                  className={RAIL_BTN}
                  onClick={() => scrollTo('section-financial')}
                >
                  <Wallet className="h-3.5 w-3.5" />
                  Financial
                </button>
                <button
                  type="button"
                  className={RAIL_BTN}
                  onClick={() => scrollTo('section-activity')}
                >
                  <Clock className="h-3.5 w-3.5" />
                  Activity
                </button>
              </div>
            </div>

          </div>
        </aside>
      </div>

      {/* Dialogs */}
      {canWrite && customer.status !== 'ARCHIVED' && (
        <CustomersEditSheet open={editOpen} onOpenChange={setEditOpen} customer={customer} />
      )}
      {canWrite && customer.status !== 'ARCHIVED' && (
        <ConfirmDialog
          open={showArchive}
          onOpenChange={setShowArchive}
          title="Archive this customer?"
          description="Archived customers are hidden from pickers and cannot receive new orders. You can restore them later."
          confirmLabel={archiving ? 'Archiving…' : 'Archive'}
          onConfirm={handleArchive}
          destructive
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  iconColor,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'warn';
  icon: typeof Package;
  iconColor: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-surface px-4 py-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            iconColor,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              'mt-0.5 font-mono text-xl font-semibold tabular-nums tracking-tight',
              tone === 'warn' ? 'text-warning' : 'text-foreground',
            )}
          >
            {value}
          </p>
          {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  action,
  className,
  children,
}: {
  title: string;
  icon: typeof Package;
  action?: React.ReactNode;
  /// Extra classes for the card root — e.g. `h-full` when a card must stretch
  /// to match its grid neighbour's height.
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border/80 bg-surface shadow-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'brand' | 'good' | 'warn' | 'muted';
}) {
  const toneClass = {
    brand: 'border-brand/25 bg-brand/8 text-foreground',
    good: 'border-success/25 bg-success/8 text-foreground',
    warn: 'border-warning/30 bg-warning/10 text-foreground',
    muted: 'border-border/60 bg-muted/25 text-foreground',
  }[tone];
  const valueClass = {
    brand: 'text-brand',
    good: 'text-success',
    warn: 'text-warning',
    muted: 'text-foreground',
  }[tone];
  return (
    <div className={cn('rounded-xl border px-3 py-2.5 flex-1', toneClass)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-1 font-mono text-sm font-semibold tabular-nums', valueClass)}>
        {value}
      </p>
    </div>
  );
}
