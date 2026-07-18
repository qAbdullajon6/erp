'use client';

import { useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrdersList, type OrderStatus, type Order } from '@/lib/api/orders';
import { useCustomersList } from '@/lib/api/customers';
import { useExecutiveOverviewQuery } from '@/lib/api/reports';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatMoney, formatDate } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import {
  Plus,
  Package,
  Search,
  Download,
  ArrowRight,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronRight,
  Truck,
  CheckCircle2,
  MapPin,
  Timer,
} from 'lucide-react';
import { toast } from 'sonner';

type OrderSortField = 'orderNumber' | 'pickupDate' | 'deliveryDate' | 'price' | 'status' | 'createdAt';

interface ListSearchState {
  page?: number;
  search?: string;
  status?: OrderStatus;
  tab?: WorkflowTab;
  sortBy?: OrderSortField;
  sortOrder?: 'asc' | 'desc';
}

type WorkflowTab = 'action' | 'active' | 'completed' | 'all';

const TAB_CONFIG: { key: WorkflowTab; label: string; statuses: OrderStatus[] | null }[] = [
  { key: 'action', label: 'Needs Action', statuses: ['DRAFT', 'PENDING'] },
  { key: 'active', label: 'Active Shipments', statuses: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] },
  { key: 'completed', label: 'Completed', statuses: ['DELIVERED', 'CANCELLED'] },
  { key: 'all', label: 'All Orders', statuses: null },
];

function getTimeUrgency(iso: string): { label: string; tone: string; urgent: boolean } {
  const target = new Date(iso);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.ceil(diffHours / 24);

  if (diffHours < 0) return { label: `${Math.abs(diffDays)}d overdue`, tone: 'text-destructive', urgent: true };
  if (diffHours < 24) return { label: 'Today', tone: 'text-warning', urgent: true };
  if (diffHours < 48) return { label: 'Tomorrow', tone: 'text-warning', urgent: false };
  if (diffDays <= 3) return { label: `${diffDays} days`, tone: 'text-muted-foreground', urgent: false };
  return { label: formatDate(iso), tone: 'text-muted-foreground', urgent: false };
}

function RouteIndicator({ from, to }: { from: string; to: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="font-medium text-foreground">{from}</span>
      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="font-medium text-foreground">{to}</span>
    </div>
  );
}

function UrgencyBadge({ date, label: contextLabel }: { date: string; label: string }) {
  const urgency = getTimeUrgency(date);
  return (
    <div className={`flex items-center gap-1 text-xs ${urgency.tone}`}>
      {urgency.urgent && <AlertTriangle className="h-3 w-3" />}
      <span>{contextLabel}: {urgency.label}</span>
    </div>
  );
}

function ExpandedOrderRow({ order, customerName }: { order: Order; customerName: string }) {
  const navigate = useNavigate();
  return (
    <TableRow className="bg-surface/50">
      <TableCell colSpan={6} className="p-0">
        <div className="grid grid-cols-3 gap-6 border-t border-brand/5 px-6 py-4">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pickup</p>
              <p className="mt-1 text-sm text-foreground">{order.pickupAddress}</p>
              <p className="text-xs text-muted-foreground">{order.pickupCity} &middot; {formatDate(order.pickupDate)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Delivery</p>
              <p className="mt-1 text-sm text-foreground">{order.deliveryAddress}</p>
              <p className="text-xs text-muted-foreground">{order.deliveryCity} &middot; {formatDate(order.deliveryDate)}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cargo</p>
              <p className="mt-1 text-sm text-foreground">{order.cargoDescription}</p>
              <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                {order.cargoWeightKg && <span>{order.cargoWeightKg} kg</span>}
                {order.cargoVolumeM3 && <span>{order.cargoVolumeM3} m³</span>}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Customer</p>
              <p className="mt-1 text-sm text-foreground">{customerName}</p>
            </div>
          </div>

          <div className="flex flex-col items-end justify-between">
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Value</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatMoney(order.price, order.currency)}</p>
            </div>
            <div className="flex gap-2">
              {order.status === 'PENDING' && !order.driverId && (
                <Button size="sm" variant="default" onClick={() => navigate({ to: `/app/orders/${order.id}` })}>
                  <Truck className="mr-1.5 h-3 w-3" />
                  Assign
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => navigate({ to: `/app/orders/${order.id}` })}>
                Full Details
              </Button>
            </div>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function OrdersList() {
  const navigate = useNavigate();
  const searchState = useSearch({ from: '/app/orders/' }) as ListSearchState;

  const currentTab = searchState.tab || 'action';
  const page = searchState.page || 1;
  const search = searchState.search || '';
  const sortBy = searchState.sortBy || 'createdAt';
  const sortOrder = searchState.sortOrder || 'desc';

  const activeTabConfig = TAB_CONFIG.find((t) => t.key === currentTab)!;
  const statusFilter = activeTabConfig.statuses ? activeTabConfig.statuses[0] : searchState.status;

  const { data, meta, loading, error, refetch } = useOrdersList({
    page,
    limit: 25,
    search: search || undefined,
    status: activeTabConfig.statuses && activeTabConfig.statuses.length === 1 ? activeTabConfig.statuses[0] : undefined,
    sortBy,
    sortOrder,
  });

  const { data: overview, isLoading: overviewLoading } = useExecutiveOverviewQuery({});

  const [localSearch, setLocalSearch] = useState(search);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: customers } = useCustomersList({ limit: 200, includeArchived: true });
  const customerNameById = useMemo(
    () => new Map(customers.map((c) => [c.id, c.companyName])),
    [customers],
  );

  const search_ = { page, search, tab: currentTab, sortBy, sortOrder, status: statusFilter };

  const handleSearch = (value: string) => {
    setLocalSearch(value);
    navigate({ to: '/app/orders', search: { ...search_, page: 1, search: value || undefined } });
  };

  const handleTabChange = (tab: WorkflowTab) => {
    navigate({ to: '/app/orders', search: { tab, page: 1, search: search || undefined } });
  };

  const handlePageChange = (newPage: number) => {
    navigate({ to: '/app/orders', search: { ...search_, page: newPage } });
  };

  const handleExport = () => {
    if (data.length === 0) {
      toast.error('No rows to export');
      return;
    }
    const csv = toCsv(
      data.map((o) => ({
        orderNumber: o.orderNumber,
        customer: customerNameById.get(o.customerId) ?? o.customerId,
        route: `${o.pickupCity} → ${o.deliveryCity}`,
        pickupDate: o.pickupDate,
        deliveryDate: o.deliveryDate,
        cargoDescription: o.cargoDescription,
        price: o.price,
        currency: o.currency,
        status: o.status,
      })),
      [
        { key: 'orderNumber', label: 'Order #' },
        { key: 'customer', label: 'Customer' },
        { key: 'route', label: 'Route' },
        { key: 'pickupDate', label: 'Pickup Date' },
        { key: 'deliveryDate', label: 'Delivery Date' },
        { key: 'cargoDescription', label: 'Cargo' },
        { key: 'price', label: 'Price' },
        { key: 'currency', label: 'Currency' },
        { key: 'status', label: 'Status' },
      ],
    );
    downloadCsv(`orders-${currentTab}-page-${page}.csv`, csv);
    toast.success(`Exported ${data.length} order${data.length === 1 ? '' : 's'}`);
  };

  const filteredData = useMemo(() => {
    if (!activeTabConfig.statuses || activeTabConfig.statuses.length <= 1) return data;
    return data.filter((o) => activeTabConfig.statuses!.includes(o.status));
  }, [data, activeTabConfig.statuses]);

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      if (a.isDelayed && !b.isDelayed) return -1;
      if (!a.isDelayed && b.isDelayed) return 1;
      if (a.status === 'PENDING' && !a.driverId && !(b.status === 'PENDING' && !b.driverId)) return -1;
      if (!(a.status === 'PENDING' && !a.driverId) && b.status === 'PENDING' && !b.driverId) return 1;
      return 0;
    });
  }, [filteredData]);

  const totals = overview?.totals;
  const tabCounts = {
    action: (totals?.activeOrders ?? 0) - ((totals?.deliveredOrders ?? 0)),
    active: totals?.activeOrders ?? 0,
    completed: totals?.deliveredOrders ?? 0,
    all: meta.total,
  };

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Compact header with search + create inline */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Shipments</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? 'Loading...' : `${meta.total} total orders`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search orders, cities, customers..."
              value={localSearch}
              onChange={(e) => handleSearch(e.target.value)}
              className="h-9 w-64 rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export
          </Button>
          <Button
            onClick={() => navigate({ to: '/app/orders/create' })}
            size="sm"
            className="bg-gradient-brand text-brand-foreground hover:opacity-90"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Order
          </Button>
        </div>
      </div>

      {/* Workflow tabs — not just a filter, this changes the mental model */}
      <div className="flex items-center gap-1 border-b border-border">
        {TAB_CONFIG.map((tab) => {
          const isActive = currentTab === tab.key;
          const count = tab.key === 'action' && totals
            ? (totals.activeOrders ?? 0) - (totals.deliveredOrders ?? 0)
            : tab.key === 'all'
              ? meta.total
              : null;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="flex items-center gap-2">
                {tab.label}
                {count !== null && (
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                    isActive ? 'bg-brand/10 text-brand' : 'bg-muted text-muted-foreground'
                  }`}>
                    {count}
                  </span>
                )}
              </span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />
              )}
            </button>
          );
        })}
      </div>

      {/* Urgency banner — only in "Needs Action" tab when there are delayed orders */}
      {currentTab === 'action' && totals && (totals.delayedOrders ?? 0) > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span className="text-sm font-medium text-destructive">
            {totals.delayedOrders} order{totals.delayedOrders === 1 ? '' : 's'} overdue
          </span>
          <span className="text-sm text-muted-foreground">— delayed orders are prioritized at the top</span>
        </div>
      )}

      {/* Main content area */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface">
        {loading && <LoadingState label="Loading orders..." />}
        {error && !loading && <ErrorState message={error} onRetry={refetch} />}
        {!loading && !error && sortedData.length === 0 && (
          <EmptyState
            icon={Package}
            title={currentTab === 'action' ? 'All caught up' : 'No orders found'}
            description={
              currentTab === 'action'
                ? 'No orders need your attention right now.'
                : 'Create an order to start moving cargo.'
            }
            action={
              currentTab !== 'action' ? (
                <Button onClick={() => navigate({ to: '/app/orders/create' })} variant="outline">
                  Create order
                </Button>
              ) : undefined
            }
          />
        )}
        {!loading && !error && sortedData.length > 0 && (
          <div className="max-h-[calc(100vh-20rem)] overflow-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-surface">
                <TableRow className="border-b border-border bg-surface/95 backdrop-blur hover:bg-surface/95">
                  <TableHead className="w-8" />
                  <TableHead className="font-medium text-xs uppercase tracking-wider">Route</TableHead>
                  <TableHead className="font-medium text-xs uppercase tracking-wider">Timeline</TableHead>
                  <TableHead className="font-medium text-xs uppercase tracking-wider">Customer</TableHead>
                  <TableHead className="font-medium text-xs uppercase tracking-wider">Value</TableHead>
                  <TableHead className="font-medium text-xs uppercase tracking-wider text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((order) => {
                  const isExpanded = expandedId === order.id;
                  const customerName = customerNameById.get(order.customerId) ?? '—';
                  const isOverdue = order.isDelayed;
                  const needsAssignment = order.status === 'PENDING' && !order.driverId;

                  return (
                    <>
                      <TableRow
                        key={order.id}
                        data-testid="order-row"
                        className={`cursor-pointer transition-colors ${
                          isOverdue ? 'bg-destructive/3 hover:bg-destructive/5' :
                          needsAssignment ? 'bg-warning/3 hover:bg-warning/5' :
                          'hover:bg-muted/50'
                        } ${isExpanded ? 'bg-muted/30' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : order.id)}
                      >
                        <TableCell className="py-3 pl-4 pr-0">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>

                        <TableCell className="py-3">
                          <div className="space-y-0.5">
                            <RouteIndicator from={order.pickupCity} to={order.deliveryCity} />
                            <p className="font-mono text-xs text-muted-foreground">{order.orderNumber}</p>
                          </div>
                        </TableCell>

                        <TableCell className="py-3">
                          <div className="space-y-0.5">
                            {order.status === 'DELIVERED' || order.status === 'CANCELLED' ? (
                              <span className="text-xs text-muted-foreground">
                                {order.status === 'DELIVERED' ? 'Delivered' : 'Cancelled'} {formatDate(order.deliveredAt || order.cancelledAt || order.updatedAt)}
                              </span>
                            ) : (
                              <>
                                <UrgencyBadge date={order.pickupDate} label="Pickup" />
                                <UrgencyBadge date={order.deliveryDate} label="Deliver" />
                              </>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="py-3">
                          <span className="text-sm text-foreground">{customerName}</span>
                        </TableCell>

                        <TableCell className="py-3">
                          <span className="font-mono text-sm font-medium text-foreground">
                            {formatMoney(order.price, order.currency)}
                          </span>
                        </TableCell>

                        <TableCell className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {needsAssignment && (
                              <span className="flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                                <Timer className="h-3 w-3" />
                                Unassigned
                              </span>
                            )}
                            <StatusBadge status={order.status} />
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <ExpandedOrderRow
                          key={`${order.id}-expanded`}
                          order={order}
                          customerName={customerName}
                        />
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <PaginationBar
        page={meta.page}
        totalPages={meta.totalPages}
        total={meta.total}
        onPageChange={handlePageChange}
        prevTestId="orders-prev-page"
        nextTestId="orders-next-page"
      />
    </div>
  );
}
