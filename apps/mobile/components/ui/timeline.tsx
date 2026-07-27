import { Text, View } from 'react-native';
import { cn } from '@/lib/utils';

export interface TimelineEntry {
  id: string;
  title: string;
  timestamp?: string;
  description?: string;
}

export interface TimelineProps {
  entries: TimelineEntry[];
  className?: string;
}

/** Renders a dispatch's `statusHistory` — one dot per recorded transition, newest
 * first (callers pass entries pre-sorted; this component doesn't re-order, so it
 * stays correct no matter which order the API happens to return). */
export function Timeline({ entries, className }: TimelineProps) {
  return (
    <View className={cn('gap-0', className)}>
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        return (
          <View key={entry.id} className="flex-row gap-3">
            <View className="items-center">
              <View className={cn('h-2.5 w-2.5 rounded-full', index === 0 ? 'bg-primary' : 'bg-muted-foreground')} />
              {!isLast && <View className="w-px flex-1 bg-border" />}
            </View>
            <View className={cn('flex-1 gap-0.5', !isLast && 'pb-4')}>
              <Text className="text-sm font-medium text-foreground">{entry.title}</Text>
              {entry.timestamp && <Text className="text-xs text-muted-foreground">{entry.timestamp}</Text>}
              {entry.description && <Text className="text-sm text-muted-foreground">{entry.description}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}
