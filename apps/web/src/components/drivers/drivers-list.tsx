'use client';

import { useState, useMemo } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useDriversList, type DriverStatus } from '@/lib/api/drivers';

export function DriversList() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DriverStatus | ''>('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { data, loading, error, refetch } = useDriversList({
    page,
    limit: 20,
    search: search || undefined,
    status: (statusFilter as DriverStatus) || undefined,
    sortBy,
    sortOrder,
  });

  const statusColors = {
    ACTIVE: 'bg-green-100 text-green-800',
    INACTIVE: 'bg-gray-100 text-gray-800',
    ON_LEAVE: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Drivers</h1>
        <button
          onClick={() => router.navigate({ to: '/app/drivers/create' })}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Create Driver
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            data-testid="drivers-search-input"
            className="flex-1 px-3 py-2 border rounded-lg"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as DriverStatus | '');
              setPage(1);
            }}
            data-testid="drivers-status-filter"
            className="px-3 py-2 border rounded-lg"
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ON_LEAVE">On Leave</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-100 text-red-800 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={refetch} data-testid="drivers-retry-button" className="underline">
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
          <p>No drivers found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th className="px-4 py-3 text-left font-semibold">Code</th>
                <th className="px-4 py-3 text-left font-semibold">Name</th>
                <th className="px-4 py-3 text-left font-semibold">Phone</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">License</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((driver) => (
                <tr key={driver.id} className="border-b hover:bg-gray-50" data-testid="driver-row">
                  <td className="px-4 py-3 font-mono text-sm">{driver.employeeCode}</td>
                  <td className="px-4 py-3">{driver.firstName} {driver.lastName}</td>
                  <td className="px-4 py-3">{driver.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-sm font-medium ${statusColors[driver.status]}`}>
                      {driver.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{driver.licenseNumber || '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => router.navigate({ to: `/app/drivers/${driver.id}` })}
                      data-testid="driver-view-button"
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
            data-testid="drivers-prev-page"
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
            data-testid="drivers-next-page"
            className="px-4 py-2 border rounded-lg disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
