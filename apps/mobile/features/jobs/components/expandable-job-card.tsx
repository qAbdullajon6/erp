import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronDown, MapPin } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, Layout } from 'react-native-reanimated';
import { Card, Skeleton, StatusBadge, Timeline, UrgencyBadge, statusLabel } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useMyDispatchQuery, type MyDispatch } from '@/services/api/endpoints/driver';
import { formatScheduled } from '../lib/format';
import { getUrgency } from '../lib/urgency';

/**
 * The list response (`GET /dispatches/my`) intentionally doesn't include
 * `statusHistory` — only the single-dispatch fetch does (see
 * services/api/endpoints/driver.ts). Expanding a card fetches that same, already-
 * existing endpoint (`GET /dispatches/my/:id`) on demand rather than inventing a
 * bulk-history endpoint or a fake timeline — the request only fires the first
 * time a card is opened, and React Query caches it after that.
 */
export function ExpandableJobCard({ dispatch }: { dispatch: MyDispatch }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const urgency = getUrgency(dispatch);
  const detailQuery = useMyDispatchQuery(dispatch.id, expanded);

  return (
    <Card className="gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${dispatch.dispatchNumber}`}
        className="active:opacity-70"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/(driver)/job/${dispatch.id}`);
        }}
      >
        <View className="flex-row items-center justify-between">
          <Text className="font-display text-base font-bold text-card-foreground">{dispatch.dispatchNumber}</Text>
          <View className="flex-row items-center gap-2">
            {urgency && <UrgencyBadge level={urgency.level} label={urgency.label} />}
            <StatusBadge status={dispatch.status} />
          </View>
        </View>

        <View className="mt-3 gap-1.5">
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

        <View className="mt-2 flex-row items-center justify-between border-t border-border pt-2">
          <Text className="text-xs text-muted-foreground">{dispatch.customer.companyName}</Text>
          <Text className="text-xs text-muted-foreground">{formatScheduled(dispatch.pickupDateScheduled)}</Text>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Hide timeline' : 'Show timeline'}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setExpanded((value) => !value);
        }}
        className="flex-row items-center justify-center gap-1 border-t border-border pt-2"
      >
        <Text className="text-xs font-semibold text-primary">{expanded ? 'Hide timeline' : 'Show timeline'}</Text>
        <Animated.View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
          <ChevronDown color={colors.primary} size={14} />
        </Animated.View>
      </Pressable>

      {expanded && (
        <Animated.View entering={FadeIn.duration(150)} layout={Layout} className="border-t border-border pt-3">
          {detailQuery.isPending ? (
            <View className="gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </View>
          ) : detailQuery.isError ? (
            <Text className="text-xs text-destructive">Couldn&rsquo;t load history for this dispatch.</Text>
          ) : detailQuery.data?.statusHistory && detailQuery.data.statusHistory.length > 0 ? (
            <Timeline
              entries={[...detailQuery.data.statusHistory].reverse().map((entry) => ({
                id: entry.id,
                title: statusLabel(entry.status),
                timestamp: formatScheduled(entry.createdAt),
                description: entry.note ?? undefined,
              }))}
            />
          ) : (
            <Text className="text-xs text-muted-foreground">No history yet.</Text>
          )}
        </Animated.View>
      )}
    </Card>
  );
}
