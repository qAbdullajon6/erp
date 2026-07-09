'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useDispatches } from '@/lib/hooks/use-dispatches';
import type { ApiDispatch } from '@/lib/api/dispatches';

export function DispatchesList() {
  const router = useRouter();
  const canCreate = true;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [driverFilter, setDriverFilter] = useState<string>('');
  const [vehicleFilter, setVehicleFilter] = useState<string>('');

  const { data, meta, loading, error, refetch } = useDispatches(page, 20, {
    search: search || undefined,
    status: statusFilter || undefined,
    driverId: driverFilter || undefined,
    vehicleId: vehicleFilter || undefined,
  });

  const statusColors: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-800',
    ASSIGNED: 'bg-blue-100 text-blue-800',
    EN_ROUTE_TO_PICKUP: 'bg-orange-100 text-orange-800',
    AT_PICKUP: 'bg-orange-100 text-orange-800',
    IN_TRANSIT: 'bg-indigo-100 text-indigo-800',
    DELIVERED: 'bg-green-100 text-green-800',
    CANCELLED: 'bg-red-100 text-red-800',
  };

  const statusLabels: Record<string, string> = {
    DRAFT: 'Draft',
    ASSIGNED: 'Assigned',
    EN_ROUTE_TO_PICKUP: 'En Route to Pickup',
    AT_PICKUP: 'At Pickup',
    IN_TRANSIT: 'In Transit',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
  };

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setDriverFilter('');
    setVehicleFilter('');
    setPage(1);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dispatches</h1>
        {canCreate && (
          <button
            onClick={() => router.navigate({ to: '/app/dispatches/create' })}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            data-testid="create-dispatch-button"
          >
            Create Dispatch
          </button>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Search dispatch number, order, customer, driver, or vehicle..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            data-testid="dispatches-search-input"
            className="flex-1 px-3 py-2 border rounded-lg"
          />
          <div className="flex gap-3 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              data-testid="dispatches-status-filter"
              className="px-3 py-2 border rounded-lg"
            >
              <option value="">All Status</option>
              <option value="DRAFT">Draft</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="EN_ROUTE_TO_PICKUP">En Route to Pickup</option>
              <option value="AT_PICKUP">At Pickup</option>
              <option value="IN_TRANSIT">In Transit</option>
              <option value="DELIVERED">Delivered</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            {(search || statusFilter || driverFilter || vehicleFilter) && (
              <button
                onClick={handleResetFilters}
                className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg border"
                data-testid="clear-filters"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-100 text-red-800 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button
            onClick={refetch}
            data-testid="dispatches-retry-button"
            className="underline"
          >
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
      ) : !data || data.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No dispatches found</p>
          {canCreate && (
            <button
              onClick={() => router.navigate({ to: '/app/dispatches/create' })}
              className="mt-4 text-blue-600 hover:underline"
            >
              Create the first dispatch
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th className="px-4 py-3 text-left font-semibold">Dispatch #</th>
                <th className="px-4 py-3 text-left font-semibold">Order #</th>
                <th className="px-4 py-3 text-left font-semibold">Customer</th>
                <th className="px-4 py-3 text-left font-semibold">Driver</th>
                <th className="px-4 py-3 text-left font-semibold">Vehicle</th>
                <th className="px-4 py-3 text-left font-semibold">Pickup</th>
                <th className="px-4 py-3 text-left font-semibold">Delivery</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((dispatch) => (
                <tr
                  key={dispatch.id}
                  className="border-b hover:bg-gray-50"
                  data-testid="dispatch-row"
                >
                  <td className="px-4 py-3 font-mono text-sm font-semibold">
                    {dispatch.dispatchNumber}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">
                    {dispatch.order?.orderNumber || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {dispatch.order?.customer?.companyName || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {dispatch.driver?.firstName} {dispatch.driver?.lastName}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">
                    {dispatch.vehicle?.plateNumber || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {formatDate(dispatch.pickupDateScheduled)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {formatDate(dispatch.deliveryDateScheduled)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-sm font-medium ${
                        statusColors[dispatch.status] ||
                        'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {statusLabels[dispatch.status] || dispatch.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() =>
                        router.navigate({
                          to: `/app/dispatches/${dispatch.id}`,
                        })
                      }
                      data-testid="dispatch-view-button"
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

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            data-testid="dispatches-prev-page"
            className="px-4 py-2 border rounded-lg disabled:opacity-50"
          >
            Previous
          </button>
          <span>
            Page {page} of {meta.totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(meta.totalPages, page + 1))}
            disabled={page === meta.totalPages}
            data-testid="dispatches-next-page"
            className="px-4 py-2 border rounded-lg disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
