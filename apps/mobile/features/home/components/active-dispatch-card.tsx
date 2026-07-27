import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Building2, Truck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Card, ProgressSteps, StatusBadge } from '@/components/ui';
import { colors } from '@/theme/tokens';
import type { MyDispatch } from '@/services/api/endpoints/driver';
import { DISPATCH_LIFECYCLE_LABELS, lifecycleIndex } from '@/features/jobs/lib/lifecycle';
import { formatScheduled } from '@/features/jobs/lib/format';

/** The hero card at the top of Home — everything the spec asked for in one place:
 * customer, pickup/delivery time, vehicle, status, and a visual read on progress
 * through the dispatch lifecycle. Tapping it opens the same Job Detail workspace
 * the Jobs list opens, so there's exactly one detail screen, not a second
 * Home-specific one. */
export function ActiveDispatchCard({ dispatch }: { dispatch: MyDispatch }) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open active job ${dispatch.dispatchNumber}`}
      className="active:opacity-70"
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(`/(driver)/job/${dispatch.id}`);
      }}
    >
      <Card className="gap-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-display text-lg font-bold text-card-foreground">{dispatch.dispatchNumber}</Text>
          <StatusBadge status={dispatch.status} />
        </View>

        <ProgressSteps labels={DISPATCH_LIFECYCLE_LABELS} currentIndex={lifecycleIndex(dispatch.status)} />

        <View className="gap-2.5 border-t border-border pt-3">
          <View className="flex-row items-center gap-2">
            <Building2 color={colors.mutedForeground} size={16} />
            <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
              {dispatch.customer.companyName}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Truck color={colors.mutedForeground} size={16} />
            <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
              {dispatch.vehicle.vehicleCode} · {dispatch.vehicle.plateNumber}
            </Text>
          </View>
        </View>

        <View className="flex-row justify-between border-t border-border pt-3">
          <View>
            <Text className="text-xs text-muted-foreground">Pickup</Text>
            <Text className="text-sm font-medium text-foreground">{formatScheduled(dispatch.pickupDateScheduled)}</Text>
          </View>
          <View className="items-end">
            <Text className="text-xs text-muted-foreground">Delivery</Text>
            <Text className="text-sm font-medium text-foreground">
              {formatScheduled(dispatch.deliveryDateScheduled)}
            </Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
