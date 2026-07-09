'use client';

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCustomersList, CustomerStatus, CustomerSortField } from '@/lib/api/customers';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';

interface ListSearchState {
  page?: number;
  search?: string;
  status?: CustomerStatus;
  sortBy?: CustomerSortField;
  sortOrder?: 'asc' | 'desc';
}

export function CustomersList() {
  const navigate = useNavigate();
  const searchState = useSearch({ from: '/app/customers' }) as ListSearchState;

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
    refetch({
      page,
      limit: 20,
      search: search || undefined,
      status: status,
      sortBy,
      sortOrder,
    });
  }, [page, search, status, sortBy, sortOrder, refetch]);

  const handleSearch = (value: string) => {
    setLocalSearch(value);
    navigate({
      to: '/app/customers',
      search: { page: 1, search: value || undefined, status, sortBy, sortOrder },
    });
  };

  const handleStatusFilter = (newStatus: CustomerStatus | '') => {
    setStatusFilter(newStatus);
    navigate({
      to: '/app/customers',
      search: { page: 1, search, status: newStatus || undefined, sortBy, sortOrder },
    });
  };

  const handleSort = (field: CustomerSortField) => {
    const newOrder = sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc';
    navigate({
      to: '/app/customers',
      search: { page, search, status, sortBy: field, sortOrder: newOrder },
    });
  };

  const handlePageChange = (newPage: number) => {
    navigate({
      to: '/app/customers',
      search: { page: newPage, search, status, sortBy, sortOrder },
    });
  };

  const getStatusBadgeClass = (s: CustomerStatus) => {
    switch (s) {
      case 'ACTIVE':
        return 'bg-success/10 text-success';
      case 'AT_RISK':
        return 'bg-warning/10 text-warning';
      case 'INACTIVE':
        return 'bg-muted text-muted-foreground';
      case 'ARCHIVED':
        return 'bg-destructive/10 text-destructive';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusLabel = (s: CustomerStatus) => {
    return s.replace(/_/g, ' ');
  };

  const SortHeader = ({ field, label }: { field: CustomerSortField; label: string }) => (
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
          <h1 className="font-display text-3xl font-bold text-foreground">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? 'Loading...' : error ? 'Error loading customers' : `${meta.total} customers found`}
          </p>
        </div>
        <Button
          onClick={() => navigate({ to: '/app/customers/create' })}
          className="gap-2 bg-gradient-brand text-brand-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Create Customer
        </Button>
      </div>

      {/* Filters & Search */}
      <div className="space-y-4 rounded-lg border border-brand/10 bg-surface p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-foreground">Search</label>
            <Input
              type="text"
              placeholder="Company name, contact, email, phone..."
              value={localSearch}
              onChange={(e) => handleSearch(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => handleStatusFilter(e.target.value as CustomerStatus | '')}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="AT_RISK">At Risk</option>
              <option value="INACTIVE">Inactive</option>
              <option value="ARCHIVED">Archived</option>
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
              <p className="mt-4 text-sm text-muted-foreground">Loading customers...</p>
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
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {!loading && data.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">No customers found</p>
            <Button
              onClick={() => navigate({ to: '/app/customers/create' })}
              variant="outline"
              className="mt-4"
            >
              Create the first customer
            </Button>
          </div>
        )}

        {!loading && data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand/10 bg-surface/50">
                  <th className="px-6 py-3 text-left text-sm">
                    <SortHeader field="companyName" label="Company" />
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Contact</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Email</th>
                  <th className="px-6 py-3 text-left text-sm">
                    <SortHeader field="creditLimit" label="Credit Limit" />
                  </th>
                  <th className="px-6 py-3 text-left text-sm">
                    <SortHeader field="status" label="Status" />
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand/10">
                {data.map((customer) => (
                  <tr
                    key={customer.id}
                    className="transition-colors hover:bg-background/40"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-foreground">{customer.companyName}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{customer.contactName}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{customer.email || '—'}</td>
                    <td className="px-6 py-4 text-sm font-mono text-foreground">
                      ${parseFloat(customer.creditLimit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeClass(customer.status)}`}>
                        {getStatusLabel(customer.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        onClick={() => navigate({ to: `/app/customers/${customer.id}` })}
                        variant="ghost"
                        size="sm"
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
          <p className="text-sm text-muted-foreground">
            Page {meta.page} of {meta.totalPages} ({meta.total} total)
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => handlePageChange(meta.page - 1)}
              disabled={meta.page <= 1}
              variant="outline"
              size="sm"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => handlePageChange(meta.page + 1)}
              disabled={meta.page >= meta.totalPages}
              variant="outline"
              size="sm"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
