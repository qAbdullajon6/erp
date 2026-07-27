import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/tokens';

export interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  right?: React.ReactNode;
  className?: string;
}

/** A custom header rather than Expo Router's default native one — every screen in
 * this app draws its own so title, back button, and trailing action stay visually
 * identical whether the screen sits in the tab stack or a pushed hidden screen. */
export function Header({ title, subtitle, showBack, right, className }: HeaderProps) {
  const router = useRouter();

  return (
    <View className={cn('flex-row items-center gap-3 px-4 py-3', className)}>
      {showBack && (
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
        >
          <ChevronLeft color={colors.foreground} size={24} />
        </Button>
      )}
      <View className="flex-1">
        <Text className="font-display text-xl font-bold text-foreground" numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}
