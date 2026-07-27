import { Pressable, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/tokens';

export interface ActionTileProps {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  /** When set, the tile renders disabled and shows this instead of firing
   * `onPress` — used for actions the backend genuinely doesn't support yet
   * (Call Dispatcher, Expenses) so the driver sees WHY, not just a dead button. */
  disabledReason?: string;
  className?: string;
}

/** The Home/Job Detail quick-action grid tile — icon over label, in a square-ish
 * card. Kept in components/ui (not features/jobs) because nothing about it is
 * dispatch-specific; it's a generic "tappable action with an icon" primitive. */
export function ActionTile({ icon, label, onPress, disabledReason, className }: ActionTileProps) {
  const isDisabled = Boolean(disabledReason);

  return (
    <Pressable
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={isDisabled ? `${label}. ${disabledReason}` : label}
      accessibilityState={{ disabled: isDisabled }}
      onPress={() => {
        if (isDisabled) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      className={cn(
        'items-center gap-2 rounded-xl border border-border bg-card px-2 py-4',
        !isDisabled && 'active:bg-secondary',
        isDisabled && 'opacity-40',
        className,
      )}
    >
      {icon}
      <Text
        className={cn('text-center text-xs font-semibold text-card-foreground')}
        numberOfLines={2}
        style={!isDisabled ? undefined : { color: colors.mutedForeground }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
