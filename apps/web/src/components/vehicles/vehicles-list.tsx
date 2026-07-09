'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useVehiclesList, type VehicleStatus } from '@/lib/api/vehicles';

export function VehiclesList() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | ''>('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { data, loading, error, refetch } = useVehiclesList({
    page,
    limit: 20,
    search: search || undefined,
    status: (statusFilter as VehicleStatus) || undefined,
    sortBy,
    sortOrder,
  });

  const statusColors = {
    AVAILABLE: 'bg-green-100 text-green-800',
    IN_USE: 'bg-blue-100 text-blue-800',
    MAINTENANCE: 'bg-orange-100 text-orange-800',
    INACTIVE: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Vehicles</h1>
        <button
          onClick={() => router.navigate({ to: '/app/vehicles/create' })}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Create Vehicle
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Search by code, plate, or type..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            data-testid="vehicles-search-input"
            className="flex-1 px-3 py-2 border rounded-lg"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as VehicleStatus | '');
              setPage(1);
            }}
            data-testid="vehicles-status-filter"
            className="px-3 py-2 border rounded-lg"
          >
            <option value="">All Status</option>
            <option value="AVAILABLE">Available</option>
            <option value="IN_USE">In Use</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-100 text-red-800 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={refetch} data-testid="vehicles-retry-button" className="underline">
            Retry
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No vehicles found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th className="px-4 py-3 text-left font-semibold">Code</th>
                <th className="px-4 py-3 text-left font-semibold">Plate</th>
                <th className="px-4 py-3 text-left font-semibold">Type</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Capacity</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((vehicle) => (
                <tr key={vehicle.id} className="border-b hover:bg-gray-50" data-testid="vehicle-row">
                  <td className="px-4 py-3 font-mono text-sm">{vehicle.vehicleCode}</td>
                  <td className="px-4 py-3">{vehicle.plateNumber}</td>
                  <td className="px-4 py-3">{vehicle.type}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-sm font-medium ${statusColors[vehicle.status]}`}>
                      {vehicle.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {vehicle.capacityKg || vehicle.capacityM3 ? `${vehicle.capacityKg || '—'}kg / ${vehicle.capacityM3 || '—'}m³` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => router.navigate({ to: `/app/vehicles/${vehicle.id}` })}
                      data-testid="vehicle-view-button"
                      className="text-blue-600 hover:underline"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            data-testid="vehicles-prev-page"
            className="px-4 py-2 border rounded-lg disabled:opacity-50"
          >
            Previous
          </button>
          <span>
            Page {page} of {data.meta.totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(data.meta.totalPages, page + 1))}
            disabled={page === data.meta.totalPages}
            data-testid="vehicles-next-page"
            className="px-4 py-2 border rounded-lg disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
