import { ActivityIndicator, Text, View } from 'react-native';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/tokens';

export function LoadingState({ label, className }: { label?: string; className?: string }) {
  return (
    <View className={cn('items-center justify-center gap-3 px-6 py-12', className)}>
      <ActivityIndicator size="large" color={colors.primary} />
      {label && <Text className="text-sm text-muted-foreground">{label}</Text>}
    </View>
  );
}
