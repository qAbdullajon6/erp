import { Text, View } from 'react-native';
import { TriangleAlert } from 'lucide-react-native';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/tokens';

export interface ErrorStateProps {
  title?: string;
  description: string;
  onRetry?: () => void;
  className?: string;
}

/** Feed the output of services/api/describe-error.ts's `describeError()` straight
 * into `description` — this component doesn't reinterpret the error, it just
 * displays it with a retry affordance. */
export function ErrorState({ title = 'Something went wrong', description, onRetry, className }: ErrorStateProps) {
  return (
    <View className={cn('items-center justify-center gap-2 px-6 py-12', className)}>
      <TriangleAlert color={colors.destructive} size={32} />
      <Text className="text-center font-display text-lg font-semibold text-foreground">{title}</Text>
      <Text className="text-center text-sm text-muted-foreground">{description}</Text>
      {onRetry && <Button variant="outline" size="sm" label="Try again" onPress={onRetry} className="mt-2" />}
    </View>
  );
}
