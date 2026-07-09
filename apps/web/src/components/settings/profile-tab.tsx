import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser, useChangePassword } from '@/lib/api/auth';

export function ProfileTab() {
  const { data: currentUser, loading, error, refetch } = useCurrentUser();
  const { changePassword, loading: changing } = useChangePassword();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!currentPassword) {
      setFormError('Enter your current password');
      return;
    }
    if (newPassword.length < 8) {
      setFormError('New password must be at least 8 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('New password and confirmation do not match');
      return;
    }

    try {
      await changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change password');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (error || !currentUser) {
    return (
      <div className="rounded-lg bg-destructive/10 p-6 text-sm text-destructive">
        {error || 'Failed to load your profile'}
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-brand/10 bg-surface p-6">
        <h2 className="font-semibold text-foreground">Your Account</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Name</p>
            <p className="font-medium text-foreground">
              {currentUser.user.firstName} {currentUser.user.lastName}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-medium text-foreground">{currentUser.user.email}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Role</p>
            <p className="font-medium text-foreground">{currentUser.membership.role.replace(/_/g, ' ')}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Organization</p>
            <p className="font-medium text-foreground">{currentUser.organization.name}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-brand/10 bg-surface p-6">
        <h2 className="font-semibold text-foreground">Change Password</h2>
        <form onSubmit={handleSubmit} className="mt-4 max-w-sm space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">Current Password</label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">New Password</label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Confirm New Password</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1"
            />
          </div>
          {formError && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}
          <Button type="submit" disabled={changing}>
            {changing ? 'Changing...' : 'Change Password'}
          </Button>
        </form>
      </div>
    </div>
  );
}
