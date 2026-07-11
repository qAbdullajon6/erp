import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge, statusLabel } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ErrorState, EmptyState } from '@/components/shared/list-states';
import {
  useMembersQuery,
  useUpdateMemberMutation,
  useRemoveMemberMutation,
  type MembershipRole,
} from '@/lib/api/organizations';
import { AddMemberDialog } from './add-member-dialog';
import { InviteMemberDialog } from './invite-member-dialog';
import { PendingInvitations } from './pending-invitations';
import { UserMinus } from 'lucide-react';

const ROLES: MembershipRole[] = [
  'ADMIN',
  'OPERATIONS_MANAGER',
  'DISPATCHER',
  'ACCOUNTANT',
  'DRIVER',
  'SALES_CRM_MANAGER',
];

export function MembersTab() {
  const { data: members, isLoading, isError, error, refetch } = useMembersQuery();
  const { mutateAsync: updateMember, isPending: updating } = useUpdateMemberMutation();
  const { mutateAsync: removeMember, isPending: removing } = useRemoveMemberMutation();

  const handleRoleChange = async (membershipId: string, role: MembershipRole) => {
    try {
      await updateMember({ membershipId, input: { role } });
      toast.success('Role updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleRemove = async (membershipId: string) => {
    try {
      await removeMember(membershipId);
      toast.success('Member removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;

  if (isError) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Failed to load members'}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{members?.length ?? 0} members</p>
        <div className="flex flex-wrap items-center gap-2">
          <InviteMemberDialog />
          <AddMemberDialog />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {!members?.length ? (
          <EmptyState title="No members yet" description="Invite a teammate to get started." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface/50 hover:bg-surface/50">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const fullName = `${member.user.firstName} ${member.user.lastName}`;
                  const initials =
                    `${member.user.firstName[0] ?? ''}${member.user.lastName[0] ?? ''}`.toUpperCase();
                  const isRemoved = member.status === 'REMOVED';

                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-brand/10 text-xs font-semibold text-brand">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-foreground">{fullName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{member.user.email}</TableCell>
                      <TableCell>
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.id, e.target.value as MembershipRole)}
                          disabled={updating || isRemoved}
                          aria-label={`Role for ${fullName}`}
                          className="h-9 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {statusLabel(r)}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={member.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {!isRemoved && (
                          /* Removing a teammate revokes their access immediately
                             and used to fire on a single unguarded click. */
                          <ConfirmDialog
                            trigger={
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                disabled={removing}
                              >
                                <UserMinus className="h-4 w-4" />
                                Remove
                              </Button>
                            }
                            title={`Remove ${fullName}?`}
                            description="They lose access to this organization immediately. You can invite them again later."
                            confirmLabel="Remove member"
                            onConfirm={() => handleRemove(member.id)}
                            destructive
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <PendingInvitations />
    </div>
  );
}
