import { useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/lib/api/auth';
import { NotificationsList } from './notifications-list';
import { NotificationPreferences } from './notification-preferences';

const NO_ACCESS_ROLES = new Set(['DRIVER']);

export function NotificationsView() {
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

  if (NO_ACCESS_ROLES.has(currentUser.membership.role)) {
    return (
      <div className="rounded-lg border border-brand/10 bg-surface p-8 text-center text-sm text-muted-foreground">
        Notifications aren't available for your role.
      </div>
    );
  }

  const isAdmin = currentUser.membership.role === 'ADMIN';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Notifications</h1>
        <p className="mt-2 text-muted-foreground">Stay on top of delayed orders, overdue invoices, and fleet alerts</p>
      </div>

      <Tabs defaultValue="notifications">
        <TabsList>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          {isAdmin && <TabsTrigger value="preferences">Preferences</TabsTrigger>}
        </TabsList>
        <TabsContent value="notifications" className="pt-4">
          <NotificationsList />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="preferences" className="pt-4">
            <NotificationPreferences />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
