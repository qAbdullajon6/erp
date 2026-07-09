'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useDriver, useUpdateDriver, useArchiveDriver, useRestoreDriver, type DriverStatus } from '@/lib/api/drivers';
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
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    status: 'ACTIVE' as DriverStatus,
  });

  if (loading) return <LoadingState label="Loading driver..." />;

  if (error || !driver) {
    return <ErrorState message={error || 'Driver not found'} onRetry={refetch} />;
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
    setSaving(true);
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
      toast.success('Driver updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update driver');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    try {
      await archiveDriver();
      refetch();
      toast.success('Driver archived');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive driver');
    }
  };

  const handleRestore = async () => {
    try {
      await restoreDriver();
      refetch();
      toast.success('Driver restored');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restore driver');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={`${driver.firstName} ${driver.lastName}`}
        subtitle={
          <span className="flex items-center gap-2">
            <span className="font-mono">{driver.employeeCode}</span>
            <StatusBadge status={driver.status} />
          </span>
        }
        action={
          <Button onClick={() => router.navigate({ to: '/app/drivers' })} variant="ghost" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />

      {driver.archivedAt && (
        <div className="flex items-center justify-between rounded-lg border border-warning/20 bg-warning/10 p-4 text-sm text-warning">
          <span>This driver is archived.</span>
          <Button onClick={handleRestore} variant="outline" size="sm">
            Restore
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? 'Edit Driver' : 'Driver Details'}</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={editData.firstName}
                    onChange={(e) => setEditData({ ...editData, firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={editData.lastName}
                    onChange={(e) => setEditData({ ...editData, lastName: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={editData.phone}
                  onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={editData.email}
                  onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={editData.status}
                  onChange={(e) => setEditData({ ...editData, status: e.target.value as DriverStatus })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="ON_LEAVE">On Leave</option>
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
                <DetailField label="Employee Code" value={driver.employeeCode} mono />
                <DetailField label="Status" value={<StatusBadge status={driver.status} />} />
                <DetailField label="Phone" value={driver.phone} />
                <DetailField label="Email" value={driver.email} />
                <DetailField label="License Number" value={driver.licenseNumber} mono />
                <DetailField label="License Expiry" value={driver.licenseExpiry} />
              </div>

              {!driver.archivedAt && (
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
                    title="Archive this driver?"
                    description="Archived drivers can no longer be assigned to dispatches. You can restore them later."
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
