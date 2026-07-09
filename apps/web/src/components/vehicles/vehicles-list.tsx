'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useVehiclesList, type VehicleStatus } from '@/lib/api/vehicles';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/page-header';
import { ListToolbar, FilterSelect } from '@/components/shared/list-toolbar';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { Plus } from 'lucide-react';

function formatCapacity(capacityKg: string | null, capacityM3: string | null) {
  if (!capacityKg && !capacityM3) return '—';
  return `${capacityKg ?? '—'}kg / ${capacityM3 ?? '—'}m³`;
}

export function VehiclesList() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | ''>('');

  const { data, loading, error, refetch } = useVehiclesList({
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
        title="Vehicles"
        subtitle={
          loading ? 'Loading...' : error ? 'Error loading vehicles' : `${meta?.total ?? 0} vehicles found`
        }
        action={
          <Button
            onClick={() => router.navigate({ to: '/app/vehicles/create' })}
            className="gap-2 bg-gradient-brand text-brand-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Create Vehicle
          </Button>
        }
      />

      <ListToolbar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search by plate, code, make, or model..."
        searchTestId="vehicles-search-input"
      >
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value as VehicleStatus | '');
            setPage(1);
          }}
          testId="vehicles-status-filter"
        >
          <option value="">All Status</option>
          <option value="AVAILABLE">Available</option>
          <option value="IN_USE">In Use</option>
          <option value="MAINTENANCE">Maintenance</option>
          <option value="INACTIVE">Inactive</option>
        </FilterSelect>
      </ListToolbar>

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {error && !loading && <ErrorState message={error} onRetry={refetch} />}

        {loading && <LoadingState label="Loading vehicles..." />}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            title="No vehicles found"
            description="Add your first vehicle to start dispatching orders."
            action={
              <Button onClick={() => router.navigate({ to: '/app/vehicles/create' })} variant="outline">
                Create the first vehicle
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
                  <TableHead>Plate</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((vehicle) => (
                  <TableRow key={vehicle.id} data-testid="vehicle-row">
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {vehicle.vehicleCode}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">{vehicle.plateNumber}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{vehicle.type}</TableCell>
                    <TableCell>
                      <StatusBadge status={vehicle.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatCapacity(vehicle.capacityKg, vehicle.capacityM3)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => router.navigate({ to: `/app/vehicles/${vehicle.id}` })}
                        data-testid="vehicle-view-button"
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
          prevTestId="vehicles-prev-page"
          nextTestId="vehicles-next-page"
        />
      )}
    </div>
  );
}
