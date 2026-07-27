import { Text, View } from 'react-native';
import { AlarmClockOff, Clock3 } from 'lucide-react-native';
import { colors } from '@/theme/tokens';
import type { UrgencyLevel } from '@/features/jobs/lib/urgency';

const STYLES: Record<UrgencyLevel, { icon: typeof Clock3; bg: string; text: string; color: string }> = {
  overdue: { icon: AlarmClockOff, bg: 'bg-destructive/15', text: 'text-destructive', color: colors.destructive },
  'due-soon': { icon: Clock3, bg: 'bg-warning/15', text: 'text-warning', color: colors.warning },
  normal: { icon: Clock3, bg: 'bg-muted', text: 'text-muted-foreground', color: colors.mutedForeground },
};

export function UrgencyBadge({ level, label }: { level: UrgencyLevel; label: string }) {
  const { icon: Icon, bg, text, color } = STYLES[level];
  return (
    <View className={`flex-row items-center gap-1 self-start rounded-full px-2 py-0.5 ${bg}`}>
      <Icon color={color} size={11} />
      <Text className={`text-[11px] font-semibold ${text}`}>{label}</Text>
    </View>
  );
}
