import { Text, View, type ViewProps } from 'react-native';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: ViewProps) {
  return <View className={cn('rounded-xl border border-border bg-card p-4', className)} {...props} />;
}

export function CardHeader({ className, ...props }: ViewProps) {
  return <View className={cn('mb-3 gap-1', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<typeof Text>) {
  return <Text className={cn('font-display text-lg font-semibold text-card-foreground', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<typeof Text>) {
  return <Text className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: ViewProps) {
  return <View className={cn('gap-2', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ViewProps) {
  return <View className={cn('mt-3 flex-row items-center gap-2', className)} {...props} />;
}
