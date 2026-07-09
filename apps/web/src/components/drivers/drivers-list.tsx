'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useDriversList, type DriverStatus } from '@/lib/api/drivers';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/page-header';
import { ListToolbar, FilterSelect } from '@/components/shared/list-toolbar';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { Plus } from 'lucide-react';

export function DriversList() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DriverStatus | ''>('');

  const { data, loading, error, refetch } = useDriversList({
    page,
    limit: 20,
    search: search || undefined,
    status: statusFilter || undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const items = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Drivers"
        subtitle={
          loading ? 'Loading...' : error ? 'Error loading drivers' : `${meta?.total ?? 0} drivers found`
        }
        action={
          <Button
            onClick={() => router.navigate({ to: '/app/drivers/create' })}
            className="gap-2 bg-gradient-brand text-brand-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Create Driver
          </Button>
        }
      />

      <ListToolbar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search by name, email, or phone..."
        searchTestId="drivers-search-input"
      >
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value as DriverStatus | '');
            setPage(1);
          }}
          testId="drivers-status-filter"
        >
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ON_LEAVE">On Leave</option>
        </FilterSelect>
      </ListToolbar>

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {error && !loading && <ErrorState message={error} onRetry={refetch} />}

        {loading && <LoadingState label="Loading drivers..." />}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            title="No drivers found"
            description="Add your first driver to start assigning deliveries."
            action={
              <Button onClick={() => router.navigate({ to: '/app/drivers/create' })} variant="outline">
                Create the first driver
              </Button>
            }
          />
        )}

        {!loading && !error && items.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface/50 hover:bg-surface/50">
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>License</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((driver) => (
                  <TableRow key={driver.id} data-testid="driver-row">
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {driver.employeeCode}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {driver.firstName} {driver.lastName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{driver.phone}</TableCell>
                    <TableCell>
                      <StatusBadge status={driver.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{driver.licenseNumber || '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => router.navigate({ to: `/app/drivers/${driver.id}` })}
                        data-testid="driver-view-button"
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
          prevTestId="drivers-prev-page"
          nextTestId="drivers-next-page"
        />
      )}
    </div>
  );
}
