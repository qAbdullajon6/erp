'use client';

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOrdersList, type OrderStatus } from '@/lib/api/orders';
import { useCustomersList } from '@/lib/api/customers';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';

interface ListSearchState {
  page?: number;
  search?: string;
  status?: OrderStatus;
  sortBy?: 'orderNumber' | 'pickupDate' | 'deliveryDate' | 'price' | 'status' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export function OrdersList() {
  const navigate = useNavigate();
  const searchState = useSearch({ from: '/app/orders' }) as ListSearchState;

  const page = searchState.page || 1;
  const search = searchState.search || '';
  const status = searchState.status;
  const sortBy = searchState.sortBy || 'createdAt';
  const sortOrder = searchState.sortOrder || 'desc';

  const { data, meta, loading, error, refetch } = useOrdersList({
    page,
    limit: 20,
    search: search || undefined,
    status,
    sortBy,
    sortOrder,
  });

  const [localSearch, setLocalSearch] = useState(search);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>(status || '');

  useEffect(() => {
    refetch();
  }, [page, search, status, sortBy, sortOrder, refetch]);

  // Resolve customerId -> company name for display; fetched once, not paginated
  // alongside orders since the two lists are independent in size.
  const { data: customers } = useCustomersList({ limit: 200, includeArchived: true });
  const customerNameById = useMemo(
    () => new Map(customers.map((c) => [c.id, c.companyName])),
    [customers],
  );

  const handleSearch = (value: string) => {
    setLocalSearch(value);
    navigate({
      to: '/app/orders',
      search: { page: 1, search: value || undefined, status, sortBy, sortOrder },
    });
  };

  const handleStatusFilter = (newStatus: OrderStatus | '') => {
    setStatusFilter(newStatus);
    navigate({
      to: '/app/orders',
      search: { page: 1, search, status: newStatus || undefined, sortBy, sortOrder },
    });
  };

  const handleSort = (field: 'orderNumber' | 'pickupDate' | 'deliveryDate' | 'price' | 'status' | 'createdAt') => {
    const newOrder = sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc';
    navigate({
      to: '/app/orders',
      search: { page, search, status, sortBy: field, sortOrder: newOrder },
    });
  };

  const handlePageChange = (newPage: number) => {
    navigate({
      to: '/app/orders',
      search: { page: newPage, search, status, sortBy, sortOrder },
    });
  };

  const getStatusBadgeClass = (s: OrderStatus) => {
    switch (s) {
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800';
      case 'PENDING':
        return 'bg-blue-100 text-blue-800';
      case 'ASSIGNED':
        return 'bg-purple-100 text-purple-800';
      case 'PICKED_UP':
        return 'bg-indigo-100 text-indigo-800';
      case 'IN_TRANSIT':
        return 'bg-yellow-100 text-yellow-800';
      case 'DELIVERED':
        return 'bg-green-100 text-green-800';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (s: OrderStatus) => {
    return s.replace(/_/g, ' ');
  };

  const SortHeader = ({ field, label }: { field: typeof sortBy; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 font-semibold text-foreground hover:text-brand transition-colors"
    >
      {label}
      {sortBy === field && (
        <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
      )}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? 'Loading...' : error ? 'Error loading orders' : `${meta.total} orders found`}
          </p>
        </div>
        <Button
          onClick={() => navigate({ to: '/app/orders/create' })}
          className="gap-2 bg-gradient-brand text-brand-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Create Order
        </Button>
      </div>

      {/* Filters & Search */}
      <div className="space-y-4 rounded-lg border border-brand/10 bg-surface p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-foreground">Search</label>
            <Input
              type="text"
              placeholder="Order number, city, cargo..."
              value={localSearch}
              onChange={(e) => handleSearch(e.target.value)}
              className="mt-1"
              data-testid="orders-search-input"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => handleStatusFilter(e.target.value as OrderStatus | '')}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              data-testid="orders-status-filter"
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING">Pending</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="PICKED_UP">Picked Up</option>
              <option value="IN_TRANSIT">In Transit</option>
              <option value="DELIVERED">Delivered</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-brand/10">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
              <p className="mt-4 text-sm text-muted-foreground">Loading orders...</p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="p-6">
            <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
              {error}
              <button
                onClick={() => refetch()}
                className="ml-2 font-semibold underline hover:no-underline"
                data-testid="orders-retry-button"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {!loading && data.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">No orders found</p>
            <Button
              onClick={() => navigate({ to: '/app/orders/create' })}
              variant="outline"
              className="mt-4"
            >
              Create the first order
            </Button>
          </div>
        )}

        {!loading && data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand/10 bg-surface/50">
                  <th className="px-6 py-3 text-left text-sm">
                    <SortHeader field="orderNumber" label="Order #" />
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Customer</th>
                  <th className="px-6 py-3 text-left text-sm">
                    <SortHeader field="pickupDate" label="Pickup" />
                  </th>
                  <th className="px-6 py-3 text-left text-sm">
                    <SortHeader field="deliveryDate" label="Delivery" />
                  </th>
                  <th className="px-6 py-3 text-left text-sm">Cargo</th>
                  <th className="px-6 py-3 text-left text-sm">
                    <SortHeader field="price" label="Price" />
                  </th>
                  <th className="px-6 py-3 text-left text-sm">
                    <SortHeader field="status" label="Status" />
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand/10">
                {data.map((order) => (
                  <tr key={order.id} className="transition-colors hover:bg-background/40" data-testid="order-row">
                    <td className="px-6 py-4 text-sm font-medium text-foreground">{order.orderNumber}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {customerNameById.get(order.customerId) ?? order.customerId}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {new Date(order.pickupDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {new Date(order.deliveryDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground truncate max-w-xs">
                      {order.cargoDescription}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-foreground">
                      {order.currency} {parseFloat(order.price).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeClass(
                          order.status,
                        )}`}
                      >
                        {getStatusLabel(order.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        onClick={() => navigate({ to: `/app/orders/${order.id}` })}
                        variant="ghost"
                        size="sm"
                        data-testid="order-view-button"
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && data.length > 0 && meta.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-brand/10 bg-surface p-4">
          <div className="text-sm text-muted-foreground">
            Page {meta.page} of {meta.totalPages} ({meta.total} total)
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => handlePageChange(Math.max(1, page - 1))}
              disabled={page === 1}
              variant="outline"
              size="sm"
              data-testid="orders-prev-page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => handlePageChange(Math.min(meta.totalPages, page + 1))}
              disabled={page === meta.totalPages}
              variant="outline"
              size="sm"
              data-testid="orders-next-page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
