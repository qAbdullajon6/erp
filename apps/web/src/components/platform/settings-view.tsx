'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  platformAPI,
  usePlatformStaffQuery,
  useSetPlatformAdminMutation,
  type PlatformStaffUser,
} from '@/lib/api/platform';
import { formatDate } from '@/lib/format';
import { describeError } from '@/lib/api/describe-error';

export function SettingsView() {
  const { data, isLoading, isError, error, refetch } = usePlatformStaffQuery();
  const { mutate: setAdmin, isPending } = useSetPlatformAdminMutation();
  const [email, setEmail] = useState('');
  const [lookup, setLookup] = useState<PlatformStaffUser | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLookingUp(true);
    setLookup(null);
    try {
      const user = await platformAPI.lookupStaff(email.trim());
      setLookup(user);
    } catch (err) {
      toast.error(describeError(err, 'User not found'));
    } finally {
      setLookingUp(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Settings" subtitle="Platform staff access" />

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Staff</h2>
        <div className="overflow-hidden rounded-lg border border-brand/10">
          {isLoading && <LoadingState label="Loading staff…" />}
          {isError && !isLoading && (
            <ErrorState
              message={describeError(error, 'Failed to load staff')}
              onRetry={() => refetch()}
            />
          )}
          {!isLoading && !isError && (data?.length ?? 0) === 0 && (
            <EmptyState title="No platform staff" description="Grant access by looking up a user email below." />
          )}
          {!isLoading && !isError && data && data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow className="bg-surface/50 hover:bg-surface/50">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.firstName} {user.lastName}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <StatusBadge status={user.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.createdAt ? formatDate(user.createdAt) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <ConfirmDialog
                        title="Revoke platform admin?"
                        description={`Remove platform console access for ${user.email}.`}
                        confirmLabel="Revoke"
                        destructive
                        onConfirm={() =>
                          setAdmin(
                            { userId: user.id, isPlatformAdmin: false },
                            {
                              onSuccess: () => toast.success('Access revoked'),
                              onError: (err) =>
                                toast.error(describeError(err, 'Failed to revoke')),
                            },
                          )
                        }
                        trigger={
                          <Button size="sm" variant="outline" disabled={isPending}>
                            Revoke
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Grant / revoke by email</h2>
        <form onSubmit={handleLookup} className="flex flex-wrap items-end gap-3 rounded-lg border border-brand/10 p-4">
          <div className="min-w-[240px] flex-1 space-y-1.5">
            <Label htmlFor="staff-email">User email</Label>
            <Input
              id="staff-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@flowerp.test"
              disabled={lookingUp}
            />
          </div>
          <Button type="submit" disabled={lookingUp || !email.trim()}>
            {lookingUp ? 'Looking up…' : 'Look up'}
          </Button>
        </form>

        {lookup && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-brand/10 p-4">
            <div>
              <p className="font-medium">
                {lookup.firstName} {lookup.lastName}
              </p>
              <p className="text-sm text-muted-foreground">{lookup.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Platform admin: {lookup.isPlatformAdmin ? 'Yes' : 'No'}
              </p>
            </div>
            {lookup.isPlatformAdmin ? (
              <ConfirmDialog
                title="Revoke platform admin?"
                description={`Remove platform console access for ${lookup.email}.`}
                confirmLabel="Revoke"
                destructive
                onConfirm={() =>
                  setAdmin(
                    { userId: lookup.id, isPlatformAdmin: false },
                    {
                      onSuccess: () => {
                        toast.success('Access revoked');
                        setLookup({ ...lookup, isPlatformAdmin: false });
                      },
                      onError: (err) =>
                        toast.error(describeError(err, 'Failed to revoke')),
                    },
                  )
                }
                trigger={
                  <Button variant="outline" disabled={isPending}>
                    Revoke
                  </Button>
                }
              />
            ) : (
              <ConfirmDialog
                title="Grant platform admin?"
                description={`Give ${lookup.email} access to the Platform Console.`}
                confirmLabel="Grant"
                onConfirm={() =>
                  setAdmin(
                    { userId: lookup.id, isPlatformAdmin: true },
                    {
                      onSuccess: () => {
                        toast.success('Access granted');
                        setLookup({ ...lookup, isPlatformAdmin: true });
                      },
                      onError: (err) =>
                        toast.error(describeError(err, 'Failed to grant')),
                    },
                  )
                }
                trigger={<Button disabled={isPending}>Grant</Button>}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}
