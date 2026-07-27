import { Text, View } from 'react-native';
import { cn } from '@/lib/utils';

export interface ProgressStepsProps {
  labels: string[];
  /** Index into `labels` of the current step. -1 renders every step unfilled
   * (nothing has happened yet, e.g. status DRAFT if it ever reached this UI). */
  currentIndex: number;
  className?: string;
}

/** A dispatch's lifecycle is a straight line (ASSIGNED → EN_ROUTE_TO_PICKUP →
 * AT_PICKUP → IN_TRANSIT → DELIVERED, R13's transition table) — this renders
 * "where in that line are we" as filled/unfilled segments. Distinct from
 * Timeline (below), which is the historical log of WHEN each step happened;
 * this is only ever "how far along," derived from the dispatch's current
 * `status`, never invented. */
export function ProgressSteps({ labels, currentIndex, className }: ProgressStepsProps) {
  return (
    <View className={cn('flex-row items-start', className)}>
      {labels.map((label, index) => {
        const isComplete = index <= currentIndex;
        const isLast = index === labels.length - 1;
        return (
          <View key={label} className={cn('items-center', !isLast && 'flex-1')}>
            <View className="w-full flex-row items-center">
              <View
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  isComplete ? 'bg-primary' : 'bg-muted',
                  index === currentIndex && 'h-3 w-3',
                )}
              />
              {!isLast && (
                <View className={cn('h-0.5 flex-1', index < currentIndex ? 'bg-primary' : 'bg-muted')} />
              )}
            </View>
            <Text
              className={cn(
                'mt-1.5 text-[10px] font-medium',
                isComplete ? 'text-foreground' : 'text-muted-foreground',
              )}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
