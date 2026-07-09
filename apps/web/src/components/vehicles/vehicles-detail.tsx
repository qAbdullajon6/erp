'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useVehicle, useUpdateVehicle, useArchiveVehicle, useRestoreVehicle } from '@/lib/api/vehicles';

interface VehiclesDetailProps {
  vehicleId: string;
}

export function VehiclesDetail({ vehicleId }: VehiclesDetailProps) {
  const router = useRouter();
  const { data: vehicle, loading, error, refetch } = useVehicle(vehicleId);
  const { mutate: updateVehicle } = useUpdateVehicle(vehicleId);
  const { mutate: archiveVehicle } = useArchiveVehicle(vehicleId);
  const { mutate: restoreVehicle } = useRestoreVehicle(vehicleId);
  const [isEditing, setIsEditing] = useState(false);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editData, setEditData] = useState({
    plateNumber: '',
    type: '',
    capacityKg: '',
    capacityM3: '',
    status: 'AVAILABLE' as const,
  });

  if (loading) {
    return <div className="animate-pulse h-96 bg-gray-200 rounded-lg" />;
  }

  if (error || !vehicle) {
    return (
      <div className="p-4 bg-red-100 text-red-800 rounded-lg">
        <p>{error || 'Vehicle not found'}</p>
        <button onClick={refetch} className="underline mt-2">
          Retry
        </button>
      </div>
    );
  }

  const initializeEdit = () => {
    setEditData({
      plateNumber: vehicle.plateNumber,
      type: vehicle.type,
      capacityKg: vehicle.capacityKg || '',
      capacityM3: vehicle.capacityM3 || '',
      status: vehicle.status,
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    try {
      await updateVehicle({
        plateNumber: editData.plateNumber,
        type: editData.type,
        capacityKg: editData.capacityKg ? parseFloat(editData.capacityKg) : undefined,
        capacityM3: editData.capacityM3 ? parseFloat(editData.capacityM3) : undefined,
        status: editData.status,
      });
      setIsEditing(false);
      refetch();
    } catch (err) {
      setEditErrors({ submit: err instanceof Error ? err.message : 'Failed to update' });
    }
  };

  const handleArchive = async () => {
    if (confirm('Archive this vehicle?')) {
      try {
        await archiveVehicle();
        refetch();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to archive');
      }
    }
  };

  const handleRestore = async () => {
    try {
      await restoreVehicle();
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to restore');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          {vehicle.plateNumber} ({vehicle.type})
        </h1>
        <button
          onClick={() => router.navigate({ to: '/app/vehicles' })}
          className="text-gray-600 hover:underline"
        >
          ← Back
        </button>
      </div>

      {vehicle.archivedAt && (
        <div className="p-4 bg-yellow-100 text-yellow-800 rounded-lg">
          This vehicle is archived
          <button
            onClick={handleRestore}
            className="ml-4 underline font-medium"
          >
            Restore
          </button>
        </div>
      )}

      {isEditing ? (
        <div className="bg-white p-6 rounded-lg border space-y-4">
          <h2 className="font-bold text-lg">Edit Vehicle</h2>

          {editErrors.submit && <p className="text-red-600 text-sm">{editErrors.submit}</p>}

          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              value={editData.plateNumber}
              onChange={(e) => setEditData({ ...editData, plateNumber: e.target.value })}
              placeholder="Plate Number"
              className="px-3 py-2 border rounded-lg"
            />
            <input
              type="text"
              value={editData.type}
              onChange={(e) => setEditData({ ...editData, type: e.target.value })}
              placeholder="Type"
              className="px-3 py-2 border rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <input
              type="number"
              step="0.01"
              min="0"
              value={editData.capacityKg}
              onChange={(e) => setEditData({ ...editData, capacityKg: e.target.value })}
              placeholder="Capacity Kg"
              className="px-3 py-2 border rounded-lg"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={editData.capacityM3}
              onChange={(e) => setEditData({ ...editData, capacityM3: e.target.value })}
              placeholder="Capacity M3"
              className="px-3 py-2 border rounded-lg"
            />
          </div>

          <select
            value={editData.status}
            onChange={(e) => setEditData({ ...editData, status: e.target.value as any })}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="AVAILABLE">Available</option>
            <option value="IN_USE">In Use</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="INACTIVE">Inactive</option>
          </select>

          <div className="flex gap-4">
            <button
              onClick={handleSaveEdit}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Save
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-lg border space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Vehicle Code</p>
              <p className="font-mono">{vehicle.vehicleCode}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Plate Number</p>
              <p>{vehicle.plateNumber}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Type</p>
              <p>{vehicle.type}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <p className="font-medium">{vehicle.status}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Capacity (kg)</p>
              <p>{vehicle.capacityKg || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Capacity (m³)</p>
              <p>{vehicle.capacityM3 || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Make</p>
              <p>{vehicle.make || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Model</p>
              <p>{vehicle.model || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Year</p>
              <p>{vehicle.year || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Insurance Expiry</p>
              <p>{vehicle.insuranceExpiry || '—'}</p>
            </div>
          </div>

          <div className="flex gap-4 pt-4 border-t">
            {!vehicle.archivedAt && (
              <>
                <button
                  onClick={initializeEdit}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  onClick={handleArchive}
                  className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                >
                  Archive
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
