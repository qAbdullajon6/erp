import { Pressable, Text, View, type PressableProps } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/tokens';

export interface ListItemProps extends Omit<PressableProps, 'children'> {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Shows a chevron when the row navigates somewhere and there's no custom
   * `trailing` already communicating that (a status badge, a switch). */
  showChevron?: boolean;
  className?: string;
}

export function ListItem({
  title,
  subtitle,
  leading,
  trailing,
  showChevron,
  onPress,
  className,
  ...props
}: ListItemProps) {
  const isInteractive = Boolean(onPress);

  return (
    <Pressable
      accessibilityRole={isInteractive ? 'button' : undefined}
      onPress={
        isInteractive
          ? (event) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPress?.(event);
            }
          : undefined
      }
      className={cn(
        'flex-row items-center gap-3 rounded-lg px-3 py-3',
        isInteractive && 'active:bg-secondary',
        className,
      )}
      {...props}
    >
      {leading}
      <View className="flex-1">
        <Text className="text-base font-medium text-foreground" numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {trailing}
      {showChevron && <ChevronRight color={colors.mutedForeground} size={20} />}
    </Pressable>
  );
}
