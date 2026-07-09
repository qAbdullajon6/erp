import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganizationQuery, useUpdateOrganizationMutation } from '@/lib/api/organizations';

interface OrganizationTabProps {
  isAdmin: boolean;
}

export function OrganizationTab({ isAdmin }: OrganizationTabProps) {
  const { data: organization, isLoading, isError, error, refetch } = useOrganizationQuery();
  const { mutateAsync, isPending } = useUpdateOrganizationMutation();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('');
  const [timezone, setTimezone] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (organization && !isEditing) {
      setName(organization.name);
      setDefaultCurrency(organization.defaultCurrency);
      setTimezone(organization.timezone);
    }
  }, [organization, isEditing]);

  if (isLoading) {
    return <Skeleton className="h-64 rounded-lg" />;
  }

  if (isError || !organization) {
    return (
      <div className="rounded-lg bg-destructive/10 p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Failed to load organization'}
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) {
      setFormError('Organization name is required');
      return;
    }
    if (!/^[A-Z]{3}$/.test(defaultCurrency)) {
      setFormError('Default currency must be a 3-letter ISO code, e.g. USD');
      return;
    }
    try {
      await mutateAsync({ name: name.trim(), defaultCurrency, timezone: timezone || undefined });
      toast.success('Organization updated');
      setIsEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update organization');
    }
  };

  return (
    <div className="rounded-lg border border-brand/10 bg-surface p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground">Organization Profile</h2>
        {isAdmin && !isEditing && (
          <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
            Edit
          </Button>
        )}
      </div>

      {!isEditing ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Name</p>
            <p className="font-medium text-foreground">{organization.name}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Slug</p>
            <p className="font-medium text-foreground">{organization.slug}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="font-medium text-foreground">{organization.status}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Default Currency</p>
            <p className="font-medium text-foreground">{organization.defaultCurrency}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Timezone</p>
            <p className="font-medium text-foreground">{organization.timezone}</p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 max-w-md space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Default Currency</label>
            <Input
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Timezone</label>
            <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} className="mt-1" placeholder="Asia/Tashkent" />
          </div>
          {formError && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setIsEditing(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
