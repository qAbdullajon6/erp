'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCustomerDetail, useUpdateCustomer, useArchiveCustomer, useRestoreCustomer, CustomerPaymentTerms, UpdateCustomerInput } from '@/lib/api/customers';
import { useCurrentUser } from '@/lib/api/auth';
import { CUSTOMER_WRITE_ROLES } from '@/lib/role-access';
import type { MembershipRole } from '@/lib/api/organizations';
import { PortalAccessPanel } from './portal-access-panel';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ArrowLeft, Edit2, Archive, RotateCcw } from 'lucide-react';

const PAYMENT_TERMS: CustomerPaymentTerms[] = ['DUE_ON_RECEIPT', 'NET_15', 'NET_30', 'NET_45'];

export function CustomerDetail({ customerId }: { customerId: string }) {
  const navigate = useNavigate();
  const { data: customer, loading, error, refetch } = useCustomerDetail(customerId);
  const { update, loading: updating } = useUpdateCustomer();
  const { archive, loading: archiving } = useArchiveCustomer();
  const { restore, loading: restoring } = useRestoreCustomer();
  const { data: currentUser } = useCurrentUser();
  const canManagePortalAccess = Boolean(
    currentUser && CUSTOMER_WRITE_ROLES.includes(currentUser.membership.role as MembershipRole),
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<UpdateCustomerInput>({});
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    refetch();
  }, [customerId, refetch]);

  useEffect(() => {
    if (customer) {
      setEditData({
        companyName: customer.companyName,
        contactName: customer.contactName,
        email: customer.email || undefined,
        phone: customer.phone || undefined,
        country: customer.country || undefined,
        city: customer.city || undefined,
        address: customer.address || undefined,
        taxId: customer.taxId || undefined,
        paymentTerms: customer.paymentTerms,
        creditLimit: parseFloat(customer.creditLimit),
        status: customer.status === 'ARCHIVED' ? undefined : customer.status,
        deliveryNotes: customer.deliveryNotes || undefined,
        internalNotes: customer.internalNotes || undefined,
      });
    }
  }, [customer]);

  const handleEditChange = (field: string, value: any) => {
    setEditData((prev) => ({ ...prev, [field]: value === '' ? undefined : value }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    try {
      await update(customerId, editData);
      toast.success('Customer updated successfully');
      setIsEditing(false);
      setIsDirty(false);
      refetch();
    } catch (err) {
      toast.error('Failed to update customer');
    }
  };

  const handleArchive = async () => {
    try {
      await archive(customerId);
      toast.success('Customer archived');
      refetch();
    } catch {
      toast.error('Failed to archive customer');
    }
  };

  const handleRestore = async () => {
    try {
      await restore(customerId);
      toast.success('Customer restored');
      refetch();
    } catch (err) {
      toast.error('Failed to restore customer');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="space-y-4">
        <Button
          onClick={() => navigate({ to: '/app/customers' })}
          variant="ghost"
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Customers
        </Button>
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
          {error || 'Customer not found'}
          <button
            onClick={() => refetch()}
            className="ml-2 font-semibold underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => navigate({ to: '/app/customers' })}
              variant="ghost"
              size="sm"
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground">{customer.companyName}</h1>
              <p className="text-sm text-muted-foreground">{customer.customerCode}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {customer.status === 'ARCHIVED' ? (
            <Button
              onClick={handleRestore}
              disabled={restoring}
              variant="outline"
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Restore
            </Button>
          ) : (
            <>
              <Button
                onClick={() => setIsEditing(!isEditing)}
                disabled={isEditing}
                variant="outline"
                className="gap-2"
              >
                <Edit2 className="h-4 w-4" />
                Edit
              </Button>
              <ConfirmDialog
                trigger={
                  <Button
                    disabled={archiving}
                    variant="outline"
                    className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                  >
                    <Archive className="h-4 w-4" />
                    Archive
                  </Button>
                }
                title="Archive this customer?"
                description="Archived customers are hidden from pickers and cannot receive new orders. You can restore them later."
                confirmLabel="Archive"
                onConfirm={handleArchive}
                destructive
              />
            </>
          )}
        </div>
      </div>

      {/* Status Badge */}
      <div className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${
        customer.status === 'ACTIVE' ? 'bg-success/10 text-success' :
        customer.status === 'AT_RISK' ? 'bg-warning/10 text-warning' :
        customer.status === 'INACTIVE' ? 'bg-muted text-muted-foreground' :
        'bg-destructive/10 text-destructive'
      }`}>
        {customer.status}
      </div>

      {/* Details */}
      {isEditing ? (
        <div className="space-y-6 rounded-lg border border-brand/10 bg-surface p-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Company Name</label>
              <Input
                value={editData.companyName || ''}
                onChange={(e) => handleEditChange('companyName', e.target.value)}
                className="mt-1"
                disabled={updating}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Contact Name</label>
              <Input
                value={editData.contactName || ''}
                onChange={(e) => handleEditChange('contactName', e.target.value)}
                className="mt-1"
                disabled={updating}
              />
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Email</label>
              <Input
                type="email"
                value={editData.email || ''}
                onChange={(e) => handleEditChange('email', e.target.value)}
                className="mt-1"
                disabled={updating}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Phone</label>
              <Input
                value={editData.phone || ''}
                onChange={(e) => handleEditChange('phone', e.target.value)}
                className="mt-1"
                disabled={updating}
              />
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium">Country</label>
              <Input
                value={editData.country || ''}
                onChange={(e) => handleEditChange('country', e.target.value)}
                className="mt-1"
                disabled={updating}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">City</label>
              <Input
                value={editData.city || ''}
                onChange={(e) => handleEditChange('city', e.target.value)}
                className="mt-1"
                disabled={updating}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Tax ID</label>
              <Input
                value={editData.taxId || ''}
                onChange={(e) => handleEditChange('taxId', e.target.value)}
                className="mt-1"
                disabled={updating}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">Address</label>
            <Input
              value={editData.address || ''}
              onChange={(e) => handleEditChange('address', e.target.value)}
              className="mt-1"
              disabled={updating}
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium">Payment Terms</label>
              <select
                value={editData.paymentTerms || 'NET_30'}
                onChange={(e) => handleEditChange('paymentTerms', e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={updating}
              >
                {PAYMENT_TERMS.map((term) => (
                  <option key={term} value={term}>
                    {term.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium">Credit Limit</label>
              <Input
                type="number"
                value={editData.creditLimit || 0}
                onChange={(e) => handleEditChange('creditLimit', parseFloat(e.target.value))}
                className="mt-1"
                step="0.01"
                disabled={updating}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Status</label>
              <select
                value={editData.status || 'ACTIVE'}
                onChange={(e) => handleEditChange('status', e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={updating}
              >
                <option value="ACTIVE">Active</option>
                <option value="AT_RISK">At Risk</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 border-t border-brand/10 pt-6">
            <Button
              onClick={handleSave}
              disabled={updating || !isDirty}
              className="bg-gradient-brand text-brand-foreground"
            >
              {updating ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button
              onClick={() => setIsEditing(false)}
              variant="outline"
              disabled={updating}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4 rounded-lg border border-brand/10 bg-surface p-6">
            <h3 className="font-semibold text-foreground">Contact Information</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Contact Name</p>
                <p className="font-medium text-foreground">{customer.contactName}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Email</p>
                <p className="font-medium text-foreground">{customer.email || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Phone</p>
                <p className="font-medium text-foreground">{customer.phone || '—'}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-brand/10 bg-surface p-6">
            <h3 className="font-semibold text-foreground">Location</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Country</p>
                <p className="font-medium text-foreground">{customer.country || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">City</p>
                <p className="font-medium text-foreground">{customer.city || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Address</p>
                <p className="font-medium text-foreground">{customer.address || '—'}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-brand/10 bg-surface p-6">
            <h3 className="font-semibold text-foreground">Financial</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Payment Terms</p>
                <p className="font-medium text-foreground">{customer.paymentTerms.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Credit Limit</p>
                <p className="font-mono font-medium text-foreground">
                  ${parseFloat(customer.creditLimit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Tax ID</p>
                <p className="font-medium text-foreground">{customer.taxId || '—'}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-brand/10 bg-surface p-6">
            <h3 className="font-semibold text-foreground">System</h3>
            <div className="space-y-3 text-xs">
              <div>
                <p className="text-muted-foreground">Created</p>
                <p className="font-medium text-foreground">{new Date(customer.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Updated</p>
                <p className="font-medium text-foreground">{new Date(customer.updatedAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">ID</p>
                <p className="font-mono text-foreground break-all text-xs">{customer.id}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {canManagePortalAccess && customer.status !== 'ARCHIVED' && (
        <PortalAccessPanel customerId={customerId} />
      )}

      {customer.deliveryNotes && (
        <div className="rounded-lg border border-brand/10 bg-surface p-6">
          <h3 className="font-semibold text-foreground">Delivery Notes</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{customer.deliveryNotes}</p>
        </div>
      )}

      {customer.internalNotes && (
        <div className="rounded-lg border border-brand/10 bg-surface p-6">
          <h3 className="font-semibold text-foreground">Internal Notes</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{customer.internalNotes}</p>
        </div>
      )}
    </div>
  );
}
