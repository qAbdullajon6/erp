import { Text, View } from 'react-native';
import { Button } from './button';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({ icon, title, description, actionLabel, onAction, className }: EmptyStateProps) {
  return (
    <View className={cn('items-center justify-center gap-2 px-6 py-12', className)}>
      {icon}
      <Text className="text-center font-display text-lg font-semibold text-foreground">{title}</Text>
      {description && <Text className="text-center text-sm text-muted-foreground">{description}</Text>}
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" label={actionLabel} onPress={onAction} className="mt-2" />
      )}
    </View>
  );
}
