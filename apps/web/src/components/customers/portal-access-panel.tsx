'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Mail, RefreshCw, Ban, Play, XCircle } from 'lucide-react';
import {
  useCustomerPortalAccessStatus,
  useInviteToPortal,
  useResendPortalInvitation,
  useRevokePortalInvitation,
  useSuspendPortalAccess,
  useReactivatePortalAccess,
} from '@/lib/api/customer-portal-provisioning';

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-success/10 text-success',
  SUSPENDED: 'bg-warning/10 text-warning',
  DISABLED: 'bg-destructive/10 text-destructive',
};

/// Staff-facing "enable/manage portal access" panel on the customer detail
/// screen. Reads and drives CustomerPortalProvisioningController — the
/// account itself is never created here directly; inviting only creates a
/// CustomerPortalInvitation, and the customer's own activation (setting a
/// password) is what creates the CustomerPortalAccount.
export function PortalAccessPanel({ customerId }: { customerId: string }) {
  const { data: status, loading } = useCustomerPortalAccessStatus(customerId);
  const { invite, loading: inviting } = useInviteToPortal(customerId);
  const { resend, loading: resending } = useResendPortalInvitation(customerId);
  const { revoke, loading: revoking } = useRevokePortalInvitation(customerId);
  const { suspend, loading: suspending } = useSuspendPortalAccess(customerId);
  const { reactivate, loading: reactivating } = useReactivatePortalAccess(customerId);
  const [busy, setBusy] = useState(false);

  if (loading || !status) {
    return (
      <div className="space-y-4 rounded-lg border border-brand/10 bg-surface p-6">
        <h3 className="font-semibold text-foreground">Portal Access</h3>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const handleInvite = async () => {
    setBusy(true);
    try {
      await invite();
      toast.success('Portal invitation sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send portal invitation');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (!status.pendingInvitation) return;
    setBusy(true);
    try {
      await resend(status.pendingInvitation.id);
      toast.success('Invitation resent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resend invitation');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!status.pendingInvitation) return;
    setBusy(true);
    try {
      await revoke(status.pendingInvitation.id);
      toast.success('Invitation revoked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke invitation');
    } finally {
      setBusy(false);
    }
  };

  const handleSuspend = async () => {
    setBusy(true);
    try {
      await suspend();
      toast.success('Portal access suspended');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to suspend portal access');
    } finally {
      setBusy(false);
    }
  };

  const handleReactivate = async () => {
    setBusy(true);
    try {
      await reactivate();
      toast.success('Portal access reactivated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reactivate portal access');
    } finally {
      setBusy(false);
    }
  };

  const anyBusy = busy || inviting || resending || revoking || suspending || reactivating;

  return (
    <div className="space-y-4 rounded-lg border border-brand/10 bg-surface p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Portal Access</h3>
        {status.hasAccount && status.accountStatus && (
          <Badge className={STATUS_STYLES[status.accountStatus]} variant="outline">
            {status.accountStatus}
          </Badge>
        )}
      </div>

      {status.hasAccount ? (
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-muted-foreground">Portal Email</p>
            <p className="font-medium text-foreground">{status.email}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Last Login</p>
            <p className="font-medium text-foreground">
              {status.lastLoginAt ? new Date(status.lastLoginAt).toLocaleString() : 'Never'}
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            {status.accountStatus === 'ACTIVE' ? (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" size="sm" disabled={anyBusy} className="gap-2">
                    <Ban className="h-3.5 w-3.5" />
                    Suspend Access
                  </Button>
                }
                title="Suspend portal access?"
                description="The customer will be signed out immediately and cannot log back in until reactivated."
                confirmLabel="Suspend"
                onConfirm={handleSuspend}
                destructive
              />
            ) : (
              <Button variant="outline" size="sm" onClick={handleReactivate} disabled={anyBusy} className="gap-2">
                <Play className="h-3.5 w-3.5" />
                Reactivate Access
              </Button>
            )}
          </div>
        </div>
      ) : status.pendingInvitation ? (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Invitation sent to <span className="font-medium text-foreground">{status.pendingInvitation.email}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Expires {new Date(status.pendingInvitation.expiresAt).toLocaleDateString()}
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={handleResend} disabled={anyBusy} className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" />
              Resend
            </Button>
            <ConfirmDialog
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={anyBusy}
                  className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Revoke
                </Button>
              }
              title="Revoke this invitation?"
              description="The activation link will stop working immediately."
              confirmLabel="Revoke"
              onConfirm={handleRevoke}
              destructive
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This customer does not have portal access yet.
          </p>
          <Button onClick={handleInvite} disabled={anyBusy} size="sm" className="gap-2 bg-gradient-brand text-brand-foreground">
            <Mail className="h-3.5 w-3.5" />
            {inviting ? 'Sending…' : 'Invite to Portal'}
          </Button>
        </div>
      )}
    </div>
  );
}
