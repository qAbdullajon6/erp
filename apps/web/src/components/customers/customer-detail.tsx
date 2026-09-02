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
import { formatMoney, formatDate, formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Edit2,
  ExternalLink,
  Mail,
  MapPin,
  Package,
  Phone,
  Plus,
  Receipt,
  RotateCcw,
  StickyNote,
  Truck,
  User,
  Wallet,
} from 'lucide-react';

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

const ACTIVITY_STYLE: Record<
  ActivityKind,
  { icon: typeof Package; className: string }
> = {
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

function invoiceCrmLabel(status: Invoice['status']): {
  label: string;
  className: string;
} {
  if (status === 'PAID') {
    return { label: 'Paid', className: 'bg-success/15 text-success' };
  }
  if (status === 'OVERDUE') {
    return { label: 'Overdue', className: 'bg-destructive/15 text-destructive' };
  }
  if (status === 'SENT' || status === 'PARTIALLY_PAID') {
    return { label: 'Open', className: 'bg-warning/15 text-warning' };
  }
  if (status === 'CANCELLED') {
    return { label: 'Cancelled', className: 'bg-muted text-muted-foreground' };
  }
  return { label: statusLabel(status), className: 'bg-muted text-muted-foreground' };
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

  const dispatchByOrderId = useMemo(() => {
    const map = new Map<string, (typeof relatedDispatches)[number]>();
    for (const d of relatedDispatches) {
      if (!map.has(d.orderId)) map.set(d.orderId, d);
    }
    return map;
  }, [relatedDispatches]);

  const invoiceByOrderId = useMemo(() => {
    const map = new Map<string, Invoice>();
    for (const inv of invoices) {
      if (inv.orderId && !map.has(inv.orderId)) map.set(inv.orderId, inv);
    }
    return map;
  }, [invoices]);

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

  const creditLimit = customer ? parseFloat(customer.creditLimit ?? '0') : 0;
  const util = customer
    ? creditUtilization(customer.creditLimit, financial.outstanding)
    : null;

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
      kind: 'account',
    });
    return items
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 24);
  }, [customer, orders, invoices, relatedDispatches]);

  if (loading) return <LoadingState label="Loading customer…" />;
  if (error || !customer) {
    return (
      <div className="space-y-4">
        <Button onClick={() => navigate({ to: '/app/customers' })} variant="ghost" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
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

  const locationLabel = [customer.city, customer.country].filter(Boolean).join(', ');

  return (
    <div className="mx-auto max-w-[1440px] space-y-2 pb-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate({ to: '/app/customers' })}
          className="transition-colors hover:text-foreground"
        >
          <ArrowLeft className="mr-1 inline h-3.5 w-3.5" />
          Customers
        </button>
        <ChevronRight className="h-3 w-3" />
        <span className="font-mono text-foreground">{customer.customerCode}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/80 bg-surface shadow-sm">
        {/* Dense CRM header */}
        <div className="border-b border-border/60 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3.5">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-base font-bold text-brand">
                {companyInitials(customer.companyName)}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    {customer.companyName}
                  </h1>
                  <StatusBadge status={customer.status} />
                  {util != null && util >= 0.8 && (
                    <Badge variant="outline" className="border-warning/40 text-[10px] text-warning">
                      High utilization
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">
                    {customer.customerCode}
                  </span>
                  {locationLabel && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {locationLabel}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 text-foreground">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Contact</span>
                    <span className="font-medium">{customer.contactName}</span>
                  </span>
                  {customer.phone && (
                    <a
                      href={`tel:${customer.phone}`}
                      className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {customer.phone}
                    </a>
                  )}
                  {customer.email && (
                    <a
                      href={`mailto:${customer.email}`}
                      className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-brand hover:underline"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {customer.email}
                    </a>
                  )}
                </div>

                {/* First-screen KPI strip inside header */}
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <HeaderChip
                    label="Open orders"
                    value={String(openOrders.length)}
                  />
                  {canViewInvoices && (
                    <HeaderChip
                      label="Outstanding"
                      value={
                        financial.outstanding > 0
                          ? formatMoney(financial.outstanding, financial.currency)
                          : '—'
                      }
                      tone={financial.outstanding > 0 ? 'warn' : undefined}
                    />
                  )}
                  <HeaderChip
                    label="Credit"
                    value={
                      Number.isFinite(creditLimit)
                        ? formatMoney(creditLimit, financial.currency)
                        : '—'
                    }
                  />
                  <HeaderChip
                    label="Terms"
                    value={customer.paymentTerms.replace(/_/g, ' ')}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {/* Backend requires status === ACTIVE to create an order for this
                  customer (orders.service.ts assertCustomerSelectable) — AT_RISK
                  and INACTIVE are rejected too, not just ARCHIVED, so the button
                  must not be offered for those either. */}
              {canCreateOrder && customer.status === 'ACTIVE' && (
                <Button
                  size="sm"
                  className="bg-gradient-brand text-brand-foreground hover:opacity-90"
                  onClick={() => navigate({ to: '/app/orders', search: { create: true, customerId } })}
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
              {canWrite &&
                (customer.status === 'ARCHIVED' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={restoring}
                    onClick={() => void handleRestore()}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Restore
                  </Button>
                ) : (
                  <ConfirmDialog
                    open={showArchive}
                    onOpenChange={setShowArchive}
                    trigger={
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive/30 text-destructive hover:bg-destructive/10"
                        disabled={archiving}
                      >
                        <Archive className="mr-1.5 h-3.5 w-3.5" />
                        Archive
                      </Button>
                    }
                    title="Archive this customer?"
                    description="Archived customers are hidden from pickers and cannot receive new orders. You can restore them later."
                    confirmLabel={archiving ? 'Archiving…' : 'Archive'}
                    onConfirm={handleArchive}
                    destructive
                  />
                ))}
            </div>
          </div>
        </div>

        {/* Mission summary — ops + sales */}
        <div className="grid grid-cols-2 gap-px border-b border-border/60 bg-border/40 sm:grid-cols-4">
          <SummaryStat label="Open orders" value={String(openOrders.length)} />
          <SummaryStat
            label="Active dispatches"
            value={String(activeDispatches.length)}
          />
          <SummaryStat
            label="Outstanding"
            value={
              canViewInvoices
                ? financial.outstanding > 0
                  ? formatMoney(financial.outstanding, financial.currency)
                  : '—'
                : '—'
            }
            tone={financial.outstanding > 0 ? 'warn' : undefined}
          />
          <SummaryStat
            label={`Revenue ${financial.year}`}
            value={formatMoney(financial.revenueYtd, financial.currency)}
            hint="From loaded orders this year"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,18%)]">
          <div className="divide-y divide-border/50 lg:border-r lg:border-border/50">
            {/* Contacts */}
            <section className="p-5">
              <SectionHeader icon={User} title="Contacts" />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/50 bg-muted/15 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Primary contact
                  </p>
                  <p className="mt-1.5 text-sm font-semibold">{customer.contactName}</p>
                  {customer.phone && (
                    <a
                      href={`tel:${customer.phone}`}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                    >
                      <Phone className="h-3 w-3" />
                      {customer.phone}
                    </a>
                  )}
                  {customer.email && (
                    <a
                      href={`mailto:${customer.email}`}
                      className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-brand"
                    >
                      <Mail className="h-3 w-3" />
                      {customer.email}
                    </a>
                  )}
                </div>
                <div className="rounded-xl border border-border/50 bg-muted/15 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Address
                  </p>
                  <p className="mt-1.5 text-sm text-foreground">
                    {customer.address || 'No street address'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{locationLabel || '—'}</p>
                  {customer.taxId && (
                    <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                      Tax ID {customer.taxId}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Timeline */}
            <section className="p-5">
              <SectionHeader icon={Clock} title="Timeline" />
              <div className="mt-3">
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
              </div>
            </section>

            {/* Orders */}
            <section className="p-5">
              <SectionHeader
                icon={Package}
                title="Orders"
                action={
                  <Link
                    to="/app/orders"
                    search={{}}
                    className="text-[11px] font-medium text-brand hover:underline"
                  >
                    All orders
                  </Link>
                }
              />
              <div className="mt-3">
                {ordersQuery.loading ? (
                  <Skeleton className="h-24 w-full" />
                ) : orders.length === 0 ? (
                  <EmptyState
                    icon={Package}
                    title="No orders yet"
                    description="Orders for this account will appear here."
                  />
                ) : (
                  <ul className="divide-y divide-border/50 rounded-xl border border-border/50">
                    {orders.slice(0, 8).map((order) => (
                      <OrderCrmRow
                        key={order.id}
                        order={order}
                        invoice={invoiceByOrderId.get(order.id)}
                        dispatch={dispatchByOrderId.get(order.id)}
                        canViewInvoices={canViewInvoices}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Invoices */}
            {canViewInvoices && (
              <section className="p-5">
                <SectionHeader
                  icon={Receipt}
                  title="Invoices"
                  action={
                    <Link
                      to="/app/finance"
                      className="text-[11px] font-medium text-brand hover:underline"
                    >
                      Finance
                    </Link>
                  }
                />
                <div className="mt-3">
                  {invoicesQuery.isPending ? (
                    <Skeleton className="h-20 w-full" />
                  ) : invoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No invoices for this account.</p>
                  ) : (
                    <ul className="divide-y divide-border/50 rounded-xl border border-border/50">
                      {invoices.slice(0, 8).map((inv) => {
                        const crm = invoiceCrmLabel(inv.status);
                        return (
                          <li
                            key={inv.id}
                            className="flex items-center justify-between gap-3 px-3.5 py-3"
                          >
                            <div>
                              <p className="font-mono text-sm font-semibold">{inv.invoiceNumber}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {formatDate(inv.issueDate)}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <p className="font-mono text-sm font-semibold tabular-nums">
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
                </div>
              </section>
            )}

            {/* Dispatches */}
            <section className="p-5">
              <SectionHeader
                icon={Truck}
                title="Dispatches"
                action={
                  <Link
                    to="/app/dispatches"
                    search={{}}
                    className="text-[11px] font-medium text-brand hover:underline"
                  >
                    All dispatches
                  </Link>
                }
              />
              <div className="mt-3">
                {dispatchesQuery.loading ? (
                  <Skeleton className="h-16 w-full" />
                ) : relatedDispatches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No linked dispatches in the recent load.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/50 rounded-xl border border-border/50">
                    {relatedDispatches.slice(0, 8).map((d) => (
                      <li key={d.id}>
                        <Link
                          to="/app/dispatches/$dispatchId"
                          params={{ dispatchId: d.id }}
                          className="flex items-center justify-between gap-3 px-3.5 py-3 hover:bg-muted/25"
                        >
                          <div>
                            <p className="font-mono text-sm font-semibold">{d.dispatchNumber}</p>
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
              </div>
            </section>

            {/* Notes */}
            <section className="p-5">
              <SectionHeader
                icon={StickyNote}
                title="Notes"
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
              />
              <div className="mt-3 space-y-3">
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
            </section>

            {/* Financial */}
            <section className="p-5">
              <SectionHeader icon={Wallet} title="Financial" />
              <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                <MetricCard
                  label="Revenue"
                  value={formatMoney(financial.revenueYtd, financial.currency)}
                  tone="brand"
                />
                {canViewInvoices && (
                  <MetricCard
                    label="Outstanding"
                    value={
                      financial.outstanding > 0
                        ? formatMoney(financial.outstanding, financial.currency)
                        : '—'
                    }
                    tone="warn"
                  />
                )}
                {canViewInvoices && (
                  <MetricCard
                    label="Paid"
                    value={
                      financial.paid > 0
                        ? formatMoney(financial.paid, financial.currency)
                        : '—'
                    }
                    tone="good"
                  />
                )}
                <MetricCard
                  label="Credit"
                  value={
                    Number.isFinite(creditLimit)
                      ? formatMoney(creditLimit, financial.currency)
                      : '—'
                  }
                  tone="muted"
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Terms {customer.paymentTerms.replace(/_/g, ' ')}
                {util != null ? ` · ${Math.round(util * 100)}% utilized` : ''}
              </p>
            </section>

            {/* Customer Access (portal) */}
            {canWrite && (
              <section className="p-5">
                <SectionHeader icon={Building2} title="Customer Access" />
                <div className="mt-3">
                  <PortalAccessPanel customerId={customerId} embedded />
                </div>
              </section>
            )}

            {/* Reserved for future CRM widgets — emails, calls, attachments */}
            <section className="border-t border-dashed border-border/40 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                Coming soon
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground/80">
                Recent emails, calls, and attachments will appear here when those APIs are available.
              </p>
            </section>
          </div>

          {/* Compact sticky rail */}
          <aside className="bg-muted/10 lg:sticky lg:top-4 lg:self-start">
            <div className="space-y-4 p-3 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
              <div>
                <h3 className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Quick actions
                </h3>
                <div className="overflow-hidden rounded-lg border border-border/60 bg-surface divide-y divide-border/50">
                  {customer.phone && (
                    <a href={`tel:${customer.phone}`} className={RAIL_BTN}>
                      <Phone className="h-3.5 w-3.5" />
                      Call
                    </a>
                  )}
                  {customer.email && (
                    <a href={`mailto:${customer.email}`} className={RAIL_BTN}>
                      <Mail className="h-3.5 w-3.5" />
                      Email
                    </a>
                  )}
                  {/* Backend requires status === ACTIVE to create an order for this
                  customer (orders.service.ts assertCustomerSelectable) — AT_RISK
                  and INACTIVE are rejected too, not just ARCHIVED, so the button
                  must not be offered for those either. */}
              {canCreateOrder && customer.status === 'ACTIVE' && (
                    <button
                      type="button"
                      className={RAIL_BTN}
                      onClick={() => navigate({ to: '/app/orders', search: { create: true, customerId } })}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      New Order
                    </button>
                  )}
                  {canWrite && customer.status !== 'ARCHIVED' && (
                    <button type="button" className={RAIL_BTN} onClick={() => setEditOpen(true)}>
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
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="tabular-nums">{formatDate(customer.createdAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Updated</dt>
                    <dd className="tabular-nums">{formatRelativeTime(customer.updatedAt)}</dd>
                  </div>
                </dl>
              </div>

              <div>
                <h3 className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Jump to
                </h3>
                <div className="overflow-hidden rounded-lg border border-border/60 bg-surface divide-y divide-border/50">
                  <Link to="/app/orders" search={{}} className={RAIL_BTN}>
                    <Package className="h-3.5 w-3.5" />
                    Orders
                  </Link>
                  <Link to="/app/dispatches" search={{}} className={RAIL_BTN}>
                    <Truck className="h-3.5 w-3.5" />
                    Dispatches
                  </Link>
                  {canViewInvoices && (
                    <Link to="/app/finance" className={RAIL_BTN}>
                      <Receipt className="h-3.5 w-3.5" />
                      Finance
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {canWrite && customer.status !== 'ARCHIVED' && (
        <CustomersEditSheet open={editOpen} onOpenChange={setEditOpen} customer={customer} />
      )}
    </div>
  );
}

function OrderCrmRow({
  order,
  invoice,
  dispatch,
  canViewInvoices,
}: {
  order: Order;
  invoice?: Invoice;
  dispatch?: { id: string };
  canViewInvoices: boolean;
}) {
  return (
    <li className="group flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-muted/25">
      <Link
        to="/app/orders/$orderId"
        params={{ orderId: order.id }}
        className="min-w-0 flex-1"
      >
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <span>{order.pickupCity}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span>{order.deliveryCity}</span>
        </div>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {order.orderNumber} · {formatDate(order.createdAt)}
        </p>
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right group-hover:hidden">
          <p className="font-mono text-sm font-semibold tabular-nums">
            {formatMoney(order.price, order.currency)}
          </p>
          <StatusBadge status={order.status} />
        </div>
        <div className="hidden items-center gap-1 group-hover:flex">
          <Button size="sm" variant="secondary" className="h-7 px-2 text-[11px]" asChild>
            <Link to="/app/orders/$orderId" params={{ orderId: order.id }}>
              <ExternalLink className="mr-1 h-3 w-3" />
              Open
            </Link>
          </Button>
          {canViewInvoices && invoice && (
            <Button size="sm" variant="secondary" className="h-7 px-2 text-[11px]" asChild>
              <Link to="/app/finance">
                <Receipt className="mr-1 h-3 w-3" />
                Invoice
              </Link>
            </Button>
          )}
          {dispatch && (
            <Button size="sm" variant="secondary" className="h-7 px-2 text-[11px]" asChild>
              <Link to="/app/dispatches/$dispatchId" params={{ dispatchId: dispatch.id }}>
                <Truck className="mr-1 h-3 w-3" />
                Dispatch
              </Link>
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function HeaderChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warn';
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'font-semibold tabular-nums text-foreground',
          tone === 'warn' && 'text-warning',
        )}
      >
        {value}
      </span>
    </span>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: typeof User;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      {action}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'warn';
}) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-mono text-lg font-semibold tabular-nums tracking-tight',
          tone === 'warn' ? 'text-warning' : 'text-foreground',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
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
    <div className={cn('rounded-xl border px-3 py-2.5', toneClass)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-1 font-mono text-sm font-semibold tabular-nums', valueClass)}>
        {value}
      </p>
    </div>
  );
}
