import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Card, StatusBadge, UrgencyBadge } from '@/components/ui';
import { colors } from '@/theme/tokens';
import type { MyDispatch } from '@/services/api/endpoints/driver';
import { formatScheduled } from '../lib/format';
import { getUrgency } from '../lib/urgency';

export function JobCard({ dispatch }: { dispatch: MyDispatch }) {
  const router = useRouter();
  const urgency = getUrgency(dispatch);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${dispatch.dispatchNumber}, ${dispatch.customer.companyName}, ${dispatch.order.pickupCity} to ${dispatch.order.deliveryCity}`}
      className="active:opacity-70"
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(`/(driver)/job/${dispatch.id}`);
      }}
    >
      <Card className="gap-3">
        <View className="flex-row items-center justify-between">
          <Text className="font-display text-base font-bold text-card-foreground">{dispatch.dispatchNumber}</Text>
          <View className="flex-row items-center gap-2">
            {urgency && <UrgencyBadge level={urgency.level} label={urgency.label} />}
            <StatusBadge status={dispatch.status} />
          </View>
        </View>

        <View className="gap-1.5">
          <View className="flex-row items-center gap-2">
            <MapPin color={colors.mutedForeground} size={14} />
            <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
              {dispatch.order.pickupCity}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <MapPin color={colors.primary} size={14} />
            <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
              {dispatch.order.deliveryCity}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center justify-between border-t border-border pt-2">
          <Text className="text-xs text-muted-foreground">{dispatch.customer.companyName}</Text>
          <Text className="text-xs text-muted-foreground">{formatScheduled(dispatch.pickupDateScheduled)}</Text>
        </View>
      </Card>
    </Pressable>
  );
}
