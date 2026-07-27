import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bell, BellOff, CircleAlert, MessageSquare, PackageSearch } from 'lucide-react-native';
import { Button, Card, EmptyState, Header, ListItem } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useNotificationPermission } from '@/services/notifications/push-notifications';

const PLANNED_NOTIFICATIONS = [
  { icon: PackageSearch, label: 'New job assigned to you' },
  { icon: CircleAlert, label: 'Delivery deadline changed' },
  { icon: MessageSquare, label: 'A note from dispatch' },
];

/**
 * apps/api's NotificationCenterController is guarded to ADMIN, OPERATIONS_MANAGER,
 * DISPATCHER, ACCOUNTANT, and SALES_CRM_MANAGER only — the controller's own comment
 * states "DRIVER is blocked at the guard." There is no in-app notification feed for
 * a driver account to read today, so this tab says that rather than rendering an
 * empty list that looks like "you have no notifications" when the truth is "this
 * account can't have any."
 *
 * Device push notification PERMISSION, unlike the feed, is real and independent of
 * this backend gap (services/notifications/push-notifications.ts) — shown here as
 * the one genuinely actionable thing this screen can offer today.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const notificationPermission = useNotificationPermission();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      <Header title="Notifications" />
      <ScrollView contentContainerClassName="gap-5 px-4 pb-8" showsVerticalScrollIndicator={false}>
        {!notificationPermission.isGranted && (
          <Card className="flex-row items-center gap-3">
            <Bell color={colors.primary} size={20} />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-foreground">Push notifications are off</Text>
              <Text className="text-xs text-muted-foreground">
                Turn them on so you don&rsquo;t miss a new job while the app is closed.
              </Text>
            </View>
            <Button variant="outline" size="sm" label="Enable" onPress={() => router.push('/(driver)/(tabs)/account')} />
          </Card>
        )}

        <EmptyState
          icon={<BellOff color={colors.mutedForeground} size={32} />}
          title="Not available for driver accounts yet"
          description="The in-app notification feed is scoped to office roles on the backend today. This isn't a bug — it just hasn't been extended to drivers."
        />

        <Card>
          <Text className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            When this ships, you&rsquo;ll see things like
          </Text>
          <View className="gap-1">
            {PLANNED_NOTIFICATIONS.map(({ icon: Icon, label }) => (
              <ListItem key={label} title={label} leading={<Icon color={colors.mutedForeground} size={18} />} />
            ))}
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
