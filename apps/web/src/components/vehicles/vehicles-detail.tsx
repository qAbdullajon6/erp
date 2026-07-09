'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import {
  useVehicle,
  useUpdateVehicle,
  useArchiveVehicle,
  useRestoreVehicle,
  type VehicleStatus,
} from '@/lib/api/vehicles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { DetailField } from '@/components/shared/detail-field';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { LoadingState, ErrorState } from '@/components/shared/list-states';
import { ArrowLeft, Archive, Pencil } from 'lucide-react';
import { toast } from 'sonner';

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
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({
    plateNumber: '',
    type: '',
    capacityKg: '',
    capacityM3: '',
    status: 'AVAILABLE' as VehicleStatus,
  });

  if (loading) return <LoadingState label="Loading vehicle..." />;

  if (error || !vehicle) {
    return <ErrorState message={error || 'Vehicle not found'} onRetry={refetch} />;
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
    setSaving(true);
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
      toast.success('Vehicle updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update vehicle');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    try {
      await archiveVehicle();
      refetch();
      toast.success('Vehicle archived');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive vehicle');
    }
  };

  const handleRestore = async () => {
    try {
      await restoreVehicle();
      refetch();
      toast.success('Vehicle restored');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restore vehicle');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={vehicle.plateNumber}
        subtitle={
          <span className="flex items-center gap-2">
            <span className="font-mono">{vehicle.vehicleCode}</span>
            <span className="capitalize">{vehicle.type}</span>
            <StatusBadge status={vehicle.status} />
          </span>
        }
        action={
          <Button onClick={() => router.navigate({ to: '/app/vehicles' })} variant="ghost" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />

      {vehicle.archivedAt && (
        <div className="flex items-center justify-between rounded-lg border border-warning/20 bg-warning/10 p-4 text-sm text-warning">
          <span>This vehicle is archived.</span>
          <Button onClick={handleRestore} variant="outline" size="sm">
            Restore
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? 'Edit Vehicle' : 'Vehicle Details'}</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="plateNumber">Plate Number</Label>
                  <Input
                    id="plateNumber"
                    value={editData.plateNumber}
                    onChange={(e) => setEditData({ ...editData, plateNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Input
                    id="type"
                    value={editData.type}
                    onChange={(e) => setEditData({ ...editData, type: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="capacityKg">Capacity (kg)</Label>
                  <Input
                    id="capacityKg"
                    type="number"
                    value={editData.capacityKg}
                    onChange={(e) => setEditData({ ...editData, capacityKg: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="capacityM3">Capacity (m³)</Label>
                  <Input
                    id="capacityM3"
                    type="number"
                    value={editData.capacityM3}
                    onChange={(e) => setEditData({ ...editData, capacityM3: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={editData.status}
                  onChange={(e) => setEditData({ ...editData, status: e.target.value as VehicleStatus })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="IN_USE">In Use</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>

              <div className="flex gap-3 border-t border-brand/10 pt-4">
                <Button onClick={handleSaveEdit} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
                <Button onClick={() => setIsEditing(false)} variant="outline" disabled={saving}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <DetailField label="Vehicle Code" value={vehicle.vehicleCode} mono />
                <DetailField label="Plate Number" value={vehicle.plateNumber} mono />
                <DetailField label="Type" value={<span className="capitalize">{vehicle.type}</span>} />
                <DetailField label="Status" value={<StatusBadge status={vehicle.status} />} />
                <DetailField label="Capacity (kg)" value={vehicle.capacityKg} />
                <DetailField label="Capacity (m³)" value={vehicle.capacityM3} />
                <DetailField label="Make" value={vehicle.make} />
                <DetailField label="Model" value={vehicle.model} />
                <DetailField label="Year" value={vehicle.year} />
                <DetailField label="Insurance Expiry" value={vehicle.insuranceExpiry} />
              </div>

              {!vehicle.archivedAt && (
                <div className="flex gap-3 border-t border-brand/10 pt-4">
                  <Button onClick={initializeEdit} variant="outline" className="gap-2">
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button variant="outline" className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10">
                        <Archive className="h-4 w-4" />
                        Archive
                      </Button>
                    }
                    title="Archive this vehicle?"
                    description="Archived vehicles can no longer be assigned to dispatches. You can restore them later."
                    confirmLabel="Archive"
                    onConfirm={handleArchive}
                    destructive
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
