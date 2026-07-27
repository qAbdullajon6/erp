import { Text, View } from 'react-native';
import { Card } from './card';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'destructive';
  className?: string;
}

const TONE_CLASSES = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
} as const;

/** The small metric tiles on Home — "3 jobs today," "1 delivered." */
export function StatCard({ label, value, icon, tone = 'default', className }: StatCardProps) {
  return (
    <Card className={cn('flex-1 gap-2', className)}>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-muted-foreground">{label}</Text>
        {icon}
      </View>
      <Text className={cn('font-display text-2xl font-bold', TONE_CLASSES[tone])}>{value}</Text>
    </Card>
  );
}
