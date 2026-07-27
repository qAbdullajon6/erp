import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, CloudOff, RefreshCw, ServerCrash } from 'lucide-react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useNetworkStore } from '@/store/network-store';
import { useOfflineQueueStore } from '@/store/offline-queue-store';
import { colors } from '@/theme/tokens';

type BannerState = 'offline' | 'server-unavailable' | 'syncing' | 'needs-review';

const COPY: Record<BannerState, { icon: typeof CloudOff; tone: string; iconColor: string }> = {
  offline: { icon: CloudOff, tone: 'bg-muted', iconColor: colors.mutedForeground },
  'server-unavailable': { icon: ServerCrash, tone: 'bg-destructive/15', iconColor: colors.destructive },
  syncing: { icon: RefreshCw, tone: 'bg-primary/15', iconColor: colors.primary },
  'needs-review': { icon: ServerCrash, tone: 'bg-warning/15', iconColor: colors.warning },
};

/**
 * One status strip, mounted once above the tab/stack content (app/(driver)/
 * _layout.tsx), covering both halves of "is everything in sync": whether the
 * connection itself is healthy (store/network-store.ts) and whether anything is
 * still waiting to leave the phone (store/offline-queue-store.ts) — a driver back
 * online with three queued status updates still needs to know they haven't sent
 * yet, not just that the wifi icon is full again.
 */
export function ConnectionBanner() {
  const connectionStatus = useNetworkStore((state) => state.status);
  const queueItems = useOfflineQueueStore((state) => state.items);
  const router = useRouter();

  const pendingCount = queueItems.filter((item) => item.state !== 'conflict').length;
  const conflictCount = queueItems.filter((item) => item.state === 'conflict').length;

  let state: BannerState | null = null;
  let label = '';

  if (connectionStatus === 'offline') {
    state = 'offline';
    label =
      pendingCount > 0
        ? `Offline — ${pendingCount} update${pendingCount === 1 ? '' : 's'} will sync automatically`
        : "You're offline — changes will sync automatically once you're back online.";
  } else if (connectionStatus === 'server-unavailable') {
    state = 'server-unavailable';
    label = "Can't reach FlowERP right now. We'll keep retrying.";
  } else if (conflictCount > 0) {
    state = 'needs-review';
    label = `${conflictCount} update${conflictCount === 1 ? '' : 's'} need${conflictCount === 1 ? 's' : ''} your review`;
  } else if (pendingCount > 0) {
    state = 'syncing';
    label = `Syncing ${pendingCount} update${pendingCount === 1 ? '' : 's'}…`;
  }

  if (!state) return null;

  const { icon: Icon, tone, iconColor } = COPY[state];
  const isTappable = queueItems.length > 0;

  return (
    <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOutUp.duration(150)}>
      <Pressable
        disabled={!isTappable}
        onPress={() => router.push('/(driver)/sync-queue')}
        className={`flex-row items-center gap-2 px-4 py-2 ${tone}`}
      >
        <Icon color={iconColor} size={16} />
        <Text className="flex-1 text-xs font-medium text-foreground">{label}</Text>
        {isTappable && <ChevronRight color={colors.mutedForeground} size={16} />}
      </Pressable>
    </Animated.View>
  );
}
