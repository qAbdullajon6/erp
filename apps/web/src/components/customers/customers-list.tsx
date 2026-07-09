'use client';

import { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCustomersList, CustomerStatus, CustomerSortField } from '@/lib/api/customers';
import { PageHeader } from '@/components/shared/page-header';
import { ListToolbar, FilterSelect } from '@/components/shared/list-toolbar';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { SortHeader } from '@/components/shared/sort-header';
import { Plus } from 'lucide-react';

interface ListSearchState {
  page?: number;
  search?: string;
  status?: CustomerStatus;
  sortBy?: CustomerSortField;
  sortOrder?: 'asc' | 'desc';
}

export function CustomersList() {
  const navigate = useNavigate();
  const searchState = useSearch({ from: '/app/customers/' }) as ListSearchState;

  const page = searchState.page || 1;
  const search = searchState.search || '';
  const status = searchState.status;
  const sortBy = searchState.sortBy || 'createdAt';
  const sortOrder = searchState.sortOrder || 'desc';

  const { data, meta, loading, error, refetch } = useCustomersList({
    page,
    limit: 20,
    search: search || undefined,
    status,
    sortBy,
    sortOrder,
  });

  const [localSearch, setLocalSearch] = useState(search);
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | ''>(status || '');

  useEffect(() => {
    refetch({ page, limit: 20, search: search || undefined, status, sortBy, sortOrder });
  }, [page, search, status, sortBy, sortOrder, refetch]);

  const handleSearch = (value: string) => {
    setLocalSearch(value);
    navigate({ to: '/app/customers', search: { page: 1, search: value || undefined, status, sortBy, sortOrder } });
  };

  const handleStatusFilter = (newStatus: CustomerStatus | '') => {
    setStatusFilter(newStatus);
    navigate({ to: '/app/customers', search: { page: 1, search, status: newStatus || undefined, sortBy, sortOrder } });
  };

  const handleSort = (field: CustomerSortField) => {
    const newOrder = sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc';
    navigate({ to: '/app/customers', search: { page, search, status, sortBy: field, sortOrder: newOrder } });
  };

  const handlePageChange = (newPage: number) => {
    navigate({ to: '/app/customers', search: { page: newPage, search, status, sortBy, sortOrder } });
  };

  const sortProps = { activeField: sortBy, order: sortOrder, onSort: handleSort };

  return (
    <div className="space-y-6" data-testid="customers-page">
      <PageHeader
        title="Customers"
        subtitle={loading ? 'Loading...' : error ? 'Error loading customers' : `${meta.total} customers found`}
        action={
          <Button
            onClick={() => navigate({ to: '/app/customers/create' })}
            className="gap-2 bg-gradient-brand text-brand-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Create Customer
          </Button>
        }
      />

      <ListToolbar
        searchValue={localSearch}
        onSearchChange={handleSearch}
        searchPlaceholder="Company name, contact, email, phone..."
        searchTestId="customers-search-input"
      >
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(value) => handleStatusFilter(value as CustomerStatus | '')}
          testId="customers-status-filter"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="AT_RISK">At Risk</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ARCHIVED">Archived</option>
        </FilterSelect>
      </ListToolbar>

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {loading && <LoadingState label="Loading customers..." />}

        {error && !loading && <ErrorState message={error} onRetry={() => refetch()} />}

        {!loading && !error && data.length === 0 && (
          <EmptyState
            title="No customers found"
            description="Add a customer before creating orders for them."
            action={
              <Button onClick={() => navigate({ to: '/app/customers/create' })} variant="outline">
                Create the first customer
              </Button>
            }
          />
        )}

        {!loading && !error && data.length > 0 && (
          <div className="overflow-x-auto">
            <Table data-testid="customers-table">
              <TableHeader>
                <TableRow className="bg-surface/50 hover:bg-surface/50">
                  <TableHead>
                    <SortHeader field="companyName" label="Company" {...sortProps} />
                  </TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>
                    <SortHeader field="creditLimit" label="Credit Limit" {...sortProps} />
                  </TableHead>
                  <TableHead>
                    <SortHeader field="status" label="Status" {...sortProps} />
                  </TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((customer) => (
                  <TableRow key={customer.id} data-testid="customer-row">
                    <TableCell className="font-medium text-foreground">{customer.companyName}</TableCell>
                    <TableCell className="text-muted-foreground">{customer.contactName}</TableCell>
                    <TableCell className="text-muted-foreground">{customer.email || '—'}</TableCell>
                    <TableCell className="font-mono text-foreground">
                      $
                      {parseFloat(customer.creditLimit).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={customer.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => navigate({ to: `/app/customers/${customer.id}` })}
                        variant="ghost"
                        size="sm"
                        data-testid="customer-view-button"
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
        prevTestId="customers-prev-page"
        nextTestId="customers-next-page"
      />
    </div>
  );
}
