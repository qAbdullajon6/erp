import { useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/lib/api/auth';
import { ProfileTab } from './profile-tab';
import { OrganizationTab } from './organization-tab';
import { MembersTab } from './members-tab';

export function SettingsView() {
  const { data: currentUser, loading, error, refetch } = useCurrentUser();

  useEffect(() => {
    refetch();
  }, [refetch]);

  if (loading) {
    return <Skeleton className="h-96 rounded-lg" />;
  }

  if (error || !currentUser) {
    return (
      <div className="rounded-lg bg-destructive/10 p-6 text-sm text-destructive">
        {error || 'Failed to load your account'}
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  const isAdmin = currentUser.membership.role === 'ADMIN';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Settings</h1>
        <p className="mt-2 text-muted-foreground">Manage your account, organization, and team</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          {isAdmin && <TabsTrigger value="members">Members</TabsTrigger>}
        </TabsList>
        <TabsContent value="profile" className="pt-4">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="organization" className="pt-4">
          <OrganizationTab isAdmin={isAdmin} />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="members" className="pt-4">
            <MembersTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
