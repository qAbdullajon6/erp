import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CloudCheck } from 'lucide-react-native';
import { Button, EmptyState, Header, Section } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useOfflineQueueStore } from '@/store/offline-queue-store';
import { drainOfflineQueue } from '@/services/offline/offline-queue';
import { useNetworkStore } from '@/store/network-store';
import { QueueItemCard } from '@/features/offline/components/queue-item-card';

export default function SyncQueueScreen() {
  const items = useOfflineQueueStore((state) => state.items);
  const isOnline = useNetworkStore((state) => state.status === 'online');

  const { needsAttention, inProgress } = useMemo(
    () => ({
      needsAttention: items.filter((item) => item.state === 'conflict'),
      inProgress: items.filter((item) => item.state !== 'conflict'),
    }),
    [items],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <Header
        title="Sync queue"
        subtitle={items.length > 0 ? `${items.length} update${items.length === 1 ? '' : 's'}` : undefined}
        showBack
      />

      {items.length === 0 ? (
        <View className="flex-1 justify-center">
          <EmptyState
            icon={<CloudCheck color={colors.success} size={32} />}
            title="All caught up"
            description="Every status update has synced. Anything you do offline will show up here until it does."
          />
        </View>
      ) : (
        <ScrollView contentContainerClassName="gap-5 px-4 pb-8 pt-2" showsVerticalScrollIndicator={false}>
          {needsAttention.length > 0 && (
            <Section title="Needs your review">
              <View className="gap-3">
                {needsAttention.map((item) => (
                  <QueueItemCard key={item.id} item={item} />
                ))}
              </View>
            </Section>
          )}
          {inProgress.length > 0 && (
            <Section
              title="Pending"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  label="Sync now"
                  disabled={!isOnline}
                  onPress={() => void drainOfflineQueue()}
                />
              }
            >
              <View className="gap-3">
                {inProgress.map((item) => (
                  <QueueItemCard key={item.id} item={item} />
                ))}
              </View>
            </Section>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
