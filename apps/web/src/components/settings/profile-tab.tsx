import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DetailField } from '@/components/shared/detail-field';
import { FormField, FormError } from '@/components/shared/form-field';
import { ErrorState } from '@/components/shared/list-states';
import { statusLabel } from '@/components/shared/status-badge';
import { useCurrentUser, useChangePassword } from '@/lib/api/auth';
import { Eye, EyeOff } from 'lucide-react';

export function ProfileTab() {
  const { data: currentUser, loading, error, refetch } = useCurrentUser();
  const { changePassword, loading: changing } = useChangePassword();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

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
      <div className="space-y-6">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (error || !currentUser) {
    return <ErrorState message={error || 'Failed to load your profile'} onRetry={refetch} />;
  }

  const { user, membership, organization } = currentUser;
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Your account</CardTitle>
          <CardDescription>Who you are signed in as.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="bg-gradient-brand text-base font-semibold text-brand-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">
                {user.firstName} {user.lastName}
              </p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>

          <div className="grid gap-6">
            <DetailField label="Role" value={<Badge variant="brand">{statusLabel(membership.role)}</Badge>} />
            <DetailField label="Organization" value={organization.name} />
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Use at least 8 characters. You'll stay signed in on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="max-w-md space-y-4">
            {formError && <FormError message={formError} />}

            <FormField id="currentPassword" label="Current password" required>
              <Input
                id="currentPassword"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </FormField>

            <FormField id="newPassword" label="New password" required hint="At least 8 characters">
              <Input
                id="newPassword"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </FormField>

            <FormField id="confirmPassword" label="Confirm new password" required>
              <Input
                id="confirmPassword"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </FormField>

            <button
              type="button"
              onClick={() => setShowPasswords((v) => !v)}
              className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showPasswords ? 'Hide passwords' : 'Show passwords'}
            </button>

            <div className="border-t border-brand/10 pt-4">
              <Button
                type="submit"
                disabled={changing}
                className="bg-gradient-brand text-brand-foreground hover:opacity-90"
              >
                {changing ? 'Changing...' : 'Change password'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
