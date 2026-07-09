import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useMembersQuery,
  useUpdateMemberMutation,
  useRemoveMemberMutation,
  type MembershipRole,
  type MembershipStatus,
} from '@/lib/api/organizations';
import { AddMemberDialog } from './add-member-dialog';

const ROLES: MembershipRole[] = ['ADMIN', 'OPERATIONS_MANAGER', 'DISPATCHER', 'ACCOUNTANT', 'DRIVER', 'SALES_CRM_MANAGER'];

function getStatusBadgeClass(status: MembershipStatus) {
  switch (status) {
    case 'ACTIVE':
      return 'bg-green-100 text-green-800';
    case 'INVITED':
      return 'bg-blue-100 text-blue-800';
    case 'REMOVED':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

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

  if (isLoading) {
    return <Skeleton className="h-64 rounded-lg" />;
  }

  if (isError) {
    return (
      <div className="rounded-lg bg-destructive/10 p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Failed to load members'}
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{members?.length ?? 0} members</p>
        <AddMemberDialog />
      </div>

      <div className="overflow-hidden rounded-lg border border-brand/10">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand/10 bg-surface/50">
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Name</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Email</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Role</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Status</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand/10">
              {members?.map((member) => (
                <tr key={member.id}>
                  <td className="px-6 py-4 text-sm font-medium text-foreground">
                    {member.user.firstName} {member.user.lastName}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{member.user.email}</td>
                  <td className="px-6 py-4 text-sm">
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.id, e.target.value as MembershipRole)}
                      disabled={updating || member.status === 'REMOVED'}
                      className="rounded-md border border-input bg-background px-2 py-1 text-sm disabled:opacity-50"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeClass(member.status)}`}>
                      {member.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {member.status !== 'REMOVED' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemove(member.id)}
                        disabled={removing}
                      >
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
