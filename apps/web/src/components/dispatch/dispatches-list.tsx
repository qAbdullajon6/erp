'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useDispatches } from '@/lib/hooks/use-dispatches';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/page-header';
import { ListToolbar, FilterSelect } from '@/components/shared/list-toolbar';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { Plus, X } from 'lucide-react';

function formatDate(dateString?: string) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DispatchesList() {
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, meta, loading, error, refetch } = useDispatches(page, 20, {
    search: search || undefined,
    status: statusFilter || undefined,
  });

  const hasFilters = Boolean(search || statusFilter);
  const items = data ?? [];

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispatches"
        subtitle={
          loading ? 'Loading...' : error ? 'Error loading dispatches' : `${meta?.total ?? 0} dispatches found`
        }
        action={
          <Button
            onClick={() => router.navigate({ to: '/app/dispatches/create' })}
            data-testid="create-dispatch-button"
            className="gap-2 bg-gradient-brand text-brand-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Create Dispatch
          </Button>
        }
      />

      <ListToolbar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search dispatch number, order, customer, driver, or vehicle..."
        searchTestId="dispatches-search-input"
      >
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value);
            setPage(1);
          }}
          testId="dispatches-status-filter"
        >
          <option value="">All Status</option>
          <option value="DRAFT">Draft</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="EN_ROUTE_TO_PICKUP">En Route to Pickup</option>
          <option value="AT_PICKUP">At Pickup</option>
          <option value="IN_TRANSIT">In Transit</option>
          <option value="DELIVERED">Delivered</option>
          <option value="CANCELLED">Cancelled</option>
        </FilterSelect>

        {hasFilters && (
          <Button onClick={handleResetFilters} variant="outline" size="sm" data-testid="clear-filters" className="gap-2">
            <X className="h-4 w-4" />
            Clear Filters
          </Button>
        )}
      </ListToolbar>

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {error && !loading && <ErrorState message={error} onRetry={refetch} />}

        {loading && <LoadingState label="Loading dispatches..." />}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            title="No dispatches found"
            description={
              hasFilters
                ? 'No dispatch matches the current filters.'
                : 'Assign a driver and vehicle to an order to create your first dispatch.'
            }
            action={
              <Button onClick={() => router.navigate({ to: '/app/dispatches/create' })} variant="outline">
                Create the first dispatch
              </Button>
            }
          />
        )}

        {!loading && !error && items.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface/50 hover:bg-surface/50">
                  <TableHead>Dispatch #</TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((dispatch) => (
                  <TableRow key={dispatch.id} data-testid="dispatch-row">
                    <TableCell className="font-mono text-sm font-semibold text-foreground">
                      {dispatch.dispatchNumber}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {dispatch.order?.orderNumber || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dispatch.order?.customer?.companyName || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dispatch.driver ? `${dispatch.driver.firstName} ${dispatch.driver.lastName}` : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {dispatch.vehicle?.plateNumber || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(dispatch.pickupDateScheduled)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(dispatch.deliveryDateScheduled)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={dispatch.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => router.navigate({ to: `/app/dispatches/${dispatch.id}` })}
                        data-testid="dispatch-view-button"
                        variant="ghost"
                        size="sm"
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

      {meta && (
        <PaginationBar
          page={page}
          totalPages={meta.totalPages}
          total={meta.total}
          onPageChange={setPage}
          prevTestId="dispatches-prev-page"
          nextTestId="dispatches-next-page"
        />
      )}
    </div>
  );
}
