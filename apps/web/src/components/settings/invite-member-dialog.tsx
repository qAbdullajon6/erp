import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { FormAlert } from '@/components/shared/form-alert';
import { statusLabel } from '@/components/shared/status-badge';
import { Mail } from 'lucide-react';
import { useCurrentUser } from '@/lib/api/auth';
import { useCreateInvitation } from '@/lib/api/invitations';
import type { MembershipRole } from '@/lib/api/organizations';

/// Sibling of AddMemberDialog (which attaches an EXISTING account). This one
/// emails an invitation to someone who has no account yet. Same dialog/form
/// shape — only the mutation differs. Rendered inside MembersTab, which
/// SettingsView already gates behind `isAdmin`, so no RBAC check is repeated
/// here.
const ROLES: MembershipRole[] = [
  'ADMIN',
  'OPERATIONS_MANAGER',
  'DISPATCHER',
  'ACCOUNTANT',
  'DRIVER',
  'SALES_CRM_MANAGER',
];

export function InviteMemberDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MembershipRole>('DISPATCHER');
  const [formError, setFormError] = useState('');

  const { data: currentUser } = useCurrentUser();
  const organizationId = currentUser?.organization.id;
  const { mutateAsync, isPending } = useCreateInvitation();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setEmail('');
      setRole('DISPATCHER');
      setFormError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return; // prevent double submission
    setFormError('');

    if (!email.trim()) {
      setFormError('Email is required');
      return;
    }
    if (!organizationId) {
      setFormError('Your organization could not be determined. Reload and try again.');
      return;
    }

    try {
      // useCreateInvitation already invalidates the organization's invitation
      // list on success — no manual cache handling here.
      await mutateAsync({ organizationId, input: { email: email.trim(), role } });
      toast.success('Invitation sent');
      handleOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invitation');
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-2">
        <Mail className="h-4 w-4" aria-hidden="true" />
        Invite Member
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>
              We&apos;ll email them a link to set a password and join this organization with the
              role you pick.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && <FormAlert message={formError} />}

            <div className="grid gap-2">
              <Label htmlFor="invite-email">Email *</Label>
              <Input
                id="invite-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invite-role">Role *</Label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value as MembershipRole)}
                disabled={isPending}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {statusLabel(r)}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Sending…' : 'Send Invitation'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
