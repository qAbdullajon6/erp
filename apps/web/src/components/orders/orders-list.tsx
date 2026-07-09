'use client';

import { useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrdersList, type OrderStatus } from '@/lib/api/orders';
import { useCustomersList } from '@/lib/api/customers';
import { PageHeader } from '@/components/shared/page-header';
import { ListToolbar, FilterSelect } from '@/components/shared/list-toolbar';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { SortHeader } from '@/components/shared/sort-header';
import { Plus } from 'lucide-react';

type OrderSortField = 'orderNumber' | 'pickupDate' | 'deliveryDate' | 'price' | 'status' | 'createdAt';

interface ListSearchState {
  page?: number;
  search?: string;
  status?: OrderStatus;
  sortBy?: OrderSortField;
  sortOrder?: 'asc' | 'desc';
}

export function OrdersList() {
  const navigate = useNavigate();
  const searchState = useSearch({ from: '/app/orders/' }) as ListSearchState;

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

  // Resolve customerId -> company name for display; fetched once, not paginated
  // alongside orders since the two lists are independent in size.
  const { data: customers } = useCustomersList({ limit: 200, includeArchived: true });
  const customerNameById = useMemo(
    () => new Map(customers.map((c) => [c.id, c.companyName])),
    [customers],
  );

  const handleSearch = (value: string) => {
    setLocalSearch(value);
    navigate({ to: '/app/orders', search: { page: 1, search: value || undefined, status, sortBy, sortOrder } });
  };

  const handleStatusFilter = (newStatus: OrderStatus | '') => {
    setStatusFilter(newStatus);
    navigate({ to: '/app/orders', search: { page: 1, search, status: newStatus || undefined, sortBy, sortOrder } });
  };

  const handleSort = (field: OrderSortField) => {
    const newOrder = sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc';
    navigate({ to: '/app/orders', search: { page, search, status, sortBy: field, sortOrder: newOrder } });
  };

  const handlePageChange = (newPage: number) => {
    navigate({ to: '/app/orders', search: { page: newPage, search, status, sortBy, sortOrder } });
  };

  const sortProps = { activeField: sortBy, order: sortOrder, onSort: handleSort };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        subtitle={loading ? 'Loading...' : error ? 'Error loading orders' : `${meta.total} orders found`}
        action={
          <Button
            onClick={() => navigate({ to: '/app/orders/create' })}
            className="gap-2 bg-gradient-brand text-brand-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Create Order
          </Button>
        }
      />

      <ListToolbar
        searchValue={localSearch}
        onSearchChange={handleSearch}
        searchPlaceholder="Order number, city, cargo..."
        searchTestId="orders-search-input"
      >
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(value) => handleStatusFilter(value as OrderStatus | '')}
          testId="orders-status-filter"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING">Pending</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="PICKED_UP">Picked Up</option>
          <option value="IN_TRANSIT">In Transit</option>
          <option value="DELIVERED">Delivered</option>
          <option value="CANCELLED">Cancelled</option>
        </FilterSelect>
      </ListToolbar>

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {loading && <LoadingState label="Loading orders..." />}

        {error && !loading && <ErrorState message={error} onRetry={refetch} />}

        {!loading && !error && data.length === 0 && (
          <EmptyState
            title="No orders found"
            description="Create an order to start moving cargo."
            action={
              <Button onClick={() => navigate({ to: '/app/orders/create' })} variant="outline">
                Create the first order
              </Button>
            }
          />
        )}

        {!loading && !error && data.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface/50 hover:bg-surface/50">
                  <TableHead>
                    <SortHeader field="orderNumber" label="Order #" {...sortProps} />
                  </TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>
                    <SortHeader field="pickupDate" label="Pickup" {...sortProps} />
                  </TableHead>
                  <TableHead>
                    <SortHeader field="deliveryDate" label="Delivery" {...sortProps} />
                  </TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>
                    <SortHeader field="price" label="Price" {...sortProps} />
                  </TableHead>
                  <TableHead>
                    <SortHeader field="status" label="Status" {...sortProps} />
                  </TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((order) => (
                  <TableRow key={order.id} data-testid="order-row">
                    <TableCell className="font-medium text-foreground">{order.orderNumber}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {customerNameById.get(order.customerId) ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(order.pickupDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(order.deliveryDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {order.cargoDescription}
                    </TableCell>
                    <TableCell className="font-mono text-foreground">
                      {order.currency} {parseFloat(order.price).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => navigate({ to: `/app/orders/${order.id}` })}
                        variant="ghost"
                        size="sm"
                        data-testid="order-view-button"
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
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
