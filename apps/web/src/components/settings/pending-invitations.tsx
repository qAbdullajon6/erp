'use client';

import { toast } from 'sonner';
import { Ban, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge, statusLabel } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { formatDate } from '@/lib/format';
import { useCurrentUser } from '@/lib/api/auth';
import {
  useInvitationsQuery,
  useResendInvitation,
  useRevokeInvitation,
  type InvitationListItem,
} from '@/lib/api/invitations';

/// A PENDING invitation whose expiry has passed can no longer be accepted, but
/// the backend leaves it PENDING until someone acts on it (expiry is derived,
/// not stored). Surface that as "Expired" so it reads correctly and offers no
/// actions. statusVariant() has no entry for ACCEPTED/REVOKED/EXPIRED, so they
/// all fall back to the muted badge — exactly what we want.
function displayStatus(invitation: InvitationListItem): string {
  if (invitation.status === 'PENDING' && new Date(invitation.expiresAt).getTime() <= Date.now()) {
    return 'EXPIRED';
  }
  return invitation.status;
}

/// Rendered inside MembersTab, which SettingsView already gates behind
/// `isAdmin` — no RBAC check is repeated here.
export function PendingInvitations() {
  const { data: currentUser } = useCurrentUser();
  const organizationId = currentUser?.organization.id;

  const { data: invitations, isLoading, isError, error, refetch } = useInvitationsQuery(organizationId);
  const resend = useResendInvitation();
  const revoke = useRevokeInvitation();
  // One mutation at a time — mirrors how MembersTab disables its row controls
  // while a member mutation is in flight, and prevents duplicate clicks.
  const busy = resend.isPending || revoke.isPending;

  const handleResend = async (invitationId: string) => {
    if (!organizationId) return;
    try {
      await resend.mutateAsync({ organizationId, invitationId });
      toast.success('Invitation resent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resend invitation');
    }
  };

  const handleRevoke = async (invitationId: string) => {
    if (!organizationId) return;
    try {
      await revoke.mutateAsync({ organizationId, invitationId });
      toast.success('Invitation revoked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke invitation');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending Invitations</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState label="Loading invitations…" />
        ) : isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load invitations'}
            onRetry={() => refetch()}
          />
        ) : !invitations?.length ? (
          <EmptyState
            title="No invitations yet"
            description="Invite a teammate and their invitation will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface/50 hover:bg-surface/50">
                  <TableHead scope="col">Email</TableHead>
                  <TableHead scope="col">Role</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Created</TableHead>
                  <TableHead scope="col">Expires</TableHead>
                  <TableHead scope="col" className="text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => {
                  const status = displayStatus(invitation);
                  const isPendingInvite = status === 'PENDING';

                  return (
                    <TableRow key={invitation.id}>
                      <TableCell className="font-medium text-foreground">{invitation.email}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {statusLabel(invitation.role)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(invitation.createdAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(invitation.expiresAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {/* Accepted / revoked / expired are terminal: the badge
                            above says everything, so no actions are offered. */}
                        {isPendingInvite && (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              disabled={busy}
                              onClick={() => handleResend(invitation.id)}
                            >
                              <Send className="h-4 w-4" aria-hidden="true" />
                              Resend
                            </Button>
                            <ConfirmDialog
                              trigger={
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  disabled={busy}
                                >
                                  <Ban className="h-4 w-4" aria-hidden="true" />
                                  Revoke
                                </Button>
                              }
                              title={`Revoke the invitation for ${invitation.email}?`}
                              description="The link in their email stops working immediately. You can invite them again later."
                              confirmLabel="Revoke invitation"
                              onConfirm={() => handleRevoke(invitation.id)}
                              destructive
                            />
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
