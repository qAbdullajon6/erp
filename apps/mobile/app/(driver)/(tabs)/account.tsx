import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Bell,
  IdCard,
  Languages,
  LogOut,
  MapPin,
  Mail,
  Moon,
  Phone,
  Radar,
  ShieldCheck,
  Truck,
} from 'lucide-react-native';
import { Avatar, Card, Dialog, Header, ListItem, Section } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { APP_VERSION } from '@/constants/config';
import { useAuthStore } from '@/store/auth-store';
import { useLogoutMutation } from '@/services/api/endpoints/auth';
import { useMyDispatchesQuery, useMyDriverProfileQuery } from '@/services/api/endpoints/driver';
import { useNotificationPermission } from '@/services/notifications/push-notifications';
import { useBackgroundLocationPermission, useForegroundLocationPermission } from '@/services/location/location-service';
import { formatDateOnly } from '@/features/jobs/lib/format';

const LICENSE_EXPIRY_WARNING_DAYS = 30;

export default function AccountScreen() {
  const router = useRouter();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const user = useAuthStore((state) => state.user);
  const organization = useAuthStore((state) => state.organization);
  const profileQuery = useMyDriverProfileQuery();
  const dispatchesQuery = useMyDispatchesQuery(false);
  const logoutMutation = useLogoutMutation();
  const notificationPermission = useNotificationPermission();
  const foregroundLocationPermission = useForegroundLocationPermission();
  const backgroundLocationPermission = useBackgroundLocationPermission();

  const activeVehicle = dispatchesQuery.data?.[0]?.vehicle;

  const licenseExpiryIso = profileQuery.data?.licenseExpiry ?? null;
  // Genuinely wall-clock-dependent display text ("expires in 3d") is supposed to
  // change as time passes — that's correct behavior, not the kind of
  // memoization-breaking impurity the react-hooks/purity rule exists to catch
  // (Math.random()/crypto in render, which breaks reconciliation identity).
  // Threading "now" through a ref/effect just to satisfy the rule would add a
  // render-lag bug of its own (stale by one commit) for no real benefit here.
  // eslint-disable-next-line react-hooks/purity -- see comment above
  const daysToExpiry = licenseExpiryIso ? Math.ceil((new Date(licenseExpiryIso).getTime() - Date.now()) / 86_400_000) : null;
  const licenseWarning =
    daysToExpiry === null || daysToExpiry > LICENSE_EXPIRY_WARNING_DAYS
      ? null
      : daysToExpiry < 0
        ? 'Expired'
        : `Expires in ${daysToExpiry}d`;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      <Header title="Account" />
      <ScrollView
        contentContainerClassName="gap-6 px-4 pb-8"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={profileQuery.isRefetching || dispatchesQuery.isRefetching}
            onRefresh={() => {
              void profileQuery.refetch();
              void dispatchesQuery.refetch();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <Card className="items-center gap-3 py-6">
          {user && <Avatar firstName={user.firstName} lastName={user.lastName} size="lg" />}
          <View className="items-center">
            <Text className="font-display text-lg font-bold text-foreground">
              {user ? `${user.firstName} ${user.lastName}` : ''}
            </Text>
            {organization && <Text className="text-sm text-muted-foreground">{organization.name}</Text>}
          </View>
        </Card>

        <Section title="Driver profile">
          <Card>
            {user?.email && (
              <ListItem title={user.email} subtitle="Email" leading={<Mail color={colors.mutedForeground} size={18} />} />
            )}
            {profileQuery.data?.phone && (
              <ListItem
                title={profileQuery.data.phone}
                subtitle="Phone"
                leading={<Phone color={colors.mutedForeground} size={18} />}
              />
            )}
            {profileQuery.data?.employeeCode && (
              <ListItem
                title={profileQuery.data.employeeCode}
                subtitle="Employee code"
                leading={<IdCard color={colors.mutedForeground} size={18} />}
              />
            )}
          </Card>
        </Section>

        <Section title="License">
          <Card>
            {profileQuery.data?.licenseNumber ? (
              <ListItem
                title={profileQuery.data.licenseNumber}
                subtitle={licenseExpiryIso ? `Expires ${formatDateOnly(licenseExpiryIso)}` : 'License number'}
                leading={<ShieldCheck color={licenseWarning ? colors.warning : colors.mutedForeground} size={18} />}
                trailing={
                  licenseWarning && (
                    <View className="rounded-full bg-warning/15 px-2 py-0.5">
                      <Text className="text-xs font-semibold text-warning">{licenseWarning}</Text>
                    </View>
                  )
                }
              />
            ) : (
              <ListItem
                title="No license on file"
                leading={<ShieldCheck color={colors.mutedForeground} size={18} />}
              />
            )}
          </Card>
        </Section>

        <Section title="Vehicle">
          <Card>
            {activeVehicle ? (
              <ListItem
                title={`${activeVehicle.vehicleCode} · ${activeVehicle.plateNumber}`}
                subtitle={activeVehicle.type}
                leading={<Truck color={colors.mutedForeground} size={18} />}
              />
            ) : (
              <ListItem
                title="No vehicle assigned right now"
                subtitle="Shows up here once dispatch assigns your next job"
                leading={<Truck color={colors.mutedForeground} size={18} />}
              />
            )}
          </Card>
        </Section>

        <Section title="Settings">
          <Card>
            <ListItem
              title="Language"
              subtitle="English — more languages aren't supported yet"
              leading={<Languages color={colors.mutedForeground} size={18} />}
            />
            <ListItem
              title="Theme"
              subtitle="Dark — FlowERP Driver is dark-first by design"
              leading={<Moon color={colors.mutedForeground} size={18} />}
            />
          </Card>
        </Section>

        <Section title="Permissions">
          <Card>
            <ListItem
              title="Notifications"
              subtitle={notificationPermission.status === 'granted' ? 'Allowed' : 'Tap to allow'}
              leading={<Bell color={colors.mutedForeground} size={18} />}
              trailing={
                <Switch
                  value={notificationPermission.isGranted}
                  onValueChange={() => {
                    void notificationPermission.request();
                  }}
                  trackColor={{ true: colors.primary, false: colors.muted }}
                />
              }
            />
            <ListItem
              title="Location"
              subtitle={foregroundLocationPermission.status === 'granted' ? 'Allowed' : 'Tap to allow'}
              leading={<MapPin color={colors.mutedForeground} size={18} />}
              trailing={
                <Switch
                  value={foregroundLocationPermission.isGranted}
                  onValueChange={() => {
                    void foregroundLocationPermission.request();
                  }}
                  trackColor={{ true: colors.primary, false: colors.muted }}
                />
              }
            />
            <ListItem
              title="Background tracking"
              subtitle={
                backgroundLocationPermission.status === 'granted'
                  ? 'Keeps sharing your position while the app is closed'
                  : 'Off — tracking pauses when you leave the app'
              }
              leading={<Radar color={colors.mutedForeground} size={18} />}
              trailing={
                <Switch
                  value={backgroundLocationPermission.isGranted}
                  onValueChange={() => {
                    void backgroundLocationPermission.request();
                  }}
                  trackColor={{ true: colors.primary, false: colors.muted }}
                />
              }
            />
          </Card>
        </Section>

        <Section>
          <Card>
            <ListItem
              title="Sign out"
              leading={<LogOut color={colors.destructive} size={18} />}
              onPress={() => setConfirmingLogout(true)}
            />
          </Card>
        </Section>

        <Pressable
          accessibilityLabel="App version"
          onLongPress={__DEV__ ? () => router.push('/(driver)/dev-diagnostics') : undefined}
        >
          <Text className="text-center text-xs text-muted-foreground">FlowERP Driver · v{APP_VERSION}</Text>
        </Pressable>
      </ScrollView>

      <Dialog
        visible={confirmingLogout}
        title="Sign out?"
        description="You'll need to sign in again to see your jobs."
        confirmLabel="Sign out"
        confirmVariant="destructive"
        loading={logoutMutation.isPending}
        onCancel={() => setConfirmingLogout(false)}
        onConfirm={() => logoutMutation.mutate(undefined, { onSettled: () => setConfirmingLogout(false) })}
      />
    </SafeAreaView>
  );
}
