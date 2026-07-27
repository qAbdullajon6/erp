import { ActivityIndicator, Text, View } from 'react-native';
import { CircleAlert, Clock, RefreshCw, Trash2 } from 'lucide-react-native';
import { Button, Card, statusLabel } from '@/components/ui';
import { colors } from '@/theme/tokens';
import type { QueuedStatusUpdate } from '@/store/offline-queue-store';
import { discardItem, retryItem } from '@/services/offline/offline-queue';

const STATE_COPY: Record<QueuedStatusUpdate['state'], { label: string; color: string }> = {
  pending: { label: 'Waiting to sync', color: colors.mutedForeground },
  syncing: { label: 'Syncing…', color: colors.primary },
  conflict: { label: 'Needs your review', color: colors.destructive },
  failed: { label: "Couldn't sync — will retry", color: colors.warning },
};

export function QueueItemCard({ item }: { item: QueuedStatusUpdate }) {
  const { label, color } = STATE_COPY[item.state];

  return (
    <Card className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="font-display text-base font-bold text-card-foreground">{item.dispatchNumber}</Text>
        <View className="flex-row items-center gap-1.5">
          {item.state === 'syncing' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : item.state === 'conflict' ? (
            <CircleAlert color={color} size={14} />
          ) : (
            <Clock color={color} size={14} />
          )}
          <Text className="text-xs font-medium" style={{ color }}>
            {label}
          </Text>
        </View>
      </View>

      <Text className="text-sm text-foreground">
        Mark as <Text className="font-semibold">{statusLabel(item.status)}</Text>
      </Text>
      {item.note && <Text className="text-sm text-muted-foreground">&ldquo;{item.note}&rdquo;</Text>}

      {item.lastError && (item.state === 'conflict' || item.state === 'failed') && (
        <Text className="text-xs text-destructive">{item.lastError}</Text>
      )}

      {(item.state === 'conflict' || item.state === 'failed') && (
        <View className="flex-row gap-2 border-t border-border pt-3">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onPress={() => discardItem(item.id)}
            accessibilityLabel="Discard this queued update"
          >
            <Trash2 color={colors.foreground} size={14} />
            <Text className="ml-1.5 font-display text-xs font-semibold text-foreground">Discard</Text>
          </Button>
          <Button variant="secondary" size="sm" className="flex-1" onPress={() => retryItem(item.id)}>
            <RefreshCw color={colors.foreground} size={14} />
            <Text className="ml-1.5 font-display text-xs font-semibold text-foreground">Retry</Text>
          </Button>
        </View>
      )}
    </Card>
  );
}
