'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useDriver, useUpdateDriver, useArchiveDriver, useRestoreDriver } from '@/lib/api/drivers';

interface DriversDetailProps {
  driverId: string;
}

export function DriversDetail({ driverId }: DriversDetailProps) {
  const router = useRouter();
  const { data: driver, loading, error, refetch } = useDriver(driverId);
  const { mutate: updateDriver } = useUpdateDriver(driverId);
  const { mutate: archiveDriver } = useArchiveDriver(driverId);
  const { mutate: restoreDriver } = useRestoreDriver(driverId);
  const [isEditing, setIsEditing] = useState(false);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editData, setEditData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    status: 'ACTIVE' as const,
  });

  if (loading) {
    return <div className="animate-pulse h-96 bg-gray-200 rounded-lg" />;
  }

  if (error || !driver) {
    return (
      <div className="p-4 bg-red-100 text-red-800 rounded-lg">
        <p>{error || 'Driver not found'}</p>
        <button onClick={refetch} className="underline mt-2">
          Retry
        </button>
      </div>
    );
  }

  const initializeEdit = () => {
    setEditData({
      firstName: driver.firstName,
      lastName: driver.lastName,
      phone: driver.phone,
      email: driver.email || '',
      status: driver.status,
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    try {
      await updateDriver({
        firstName: editData.firstName,
        lastName: editData.lastName,
        phone: editData.phone,
        email: editData.email || undefined,
        status: editData.status,
      });
      setIsEditing(false);
      refetch();
    } catch (err) {
      setEditErrors({ submit: err instanceof Error ? err.message : 'Failed to update' });
    }
  };

  const handleArchive = async () => {
    if (confirm('Archive this driver?')) {
      try {
        await archiveDriver();
        refetch();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to archive');
      }
    }
  };

  const handleRestore = async () => {
    try {
      await restoreDriver();
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to restore');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          {driver.firstName} {driver.lastName}
        </h1>
        <button
          onClick={() => router.navigate({ to: '/app/drivers' })}
          className="text-gray-600 hover:underline"
        >
          ← Back
        </button>
      </div>

      {driver.archivedAt && (
        <div className="p-4 bg-yellow-100 text-yellow-800 rounded-lg">
          This driver is archived
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
          <h2 className="font-bold text-lg">Edit Driver</h2>

          {editErrors.submit && <p className="text-red-600 text-sm">{editErrors.submit}</p>}

          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              value={editData.firstName}
              onChange={(e) => setEditData({ ...editData, firstName: e.target.value })}
              placeholder="First Name"
              className="px-3 py-2 border rounded-lg"
            />
            <input
              type="text"
              value={editData.lastName}
              onChange={(e) => setEditData({ ...editData, lastName: e.target.value })}
              placeholder="Last Name"
              className="px-3 py-2 border rounded-lg"
            />
          </div>

          <input
            type="tel"
            value={editData.phone}
            onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
            placeholder="Phone"
            className="w-full px-3 py-2 border rounded-lg"
          />

          <input
            type="email"
            value={editData.email}
            onChange={(e) => setEditData({ ...editData, email: e.target.value })}
            placeholder="Email"
            className="w-full px-3 py-2 border rounded-lg"
          />

          <select
            value={editData.status}
            onChange={(e) => setEditData({ ...editData, status: e.target.value as any })}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ON_LEAVE">On Leave</option>
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
              <p className="text-sm text-gray-600">Employee Code</p>
              <p className="font-mono">{driver.employeeCode}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <p className="font-medium">{driver.status}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Phone</p>
              <p>{driver.phone}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p>{driver.email || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">License Number</p>
              <p>{driver.licenseNumber || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">License Expiry</p>
              <p>{driver.licenseExpiry || '—'}</p>
            </div>
          </div>

          <div className="flex gap-4 pt-4 border-t">
            {!driver.archivedAt && (
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
