import { useEffect } from 'react';
import { type ViewProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { cn } from '@/lib/utils';

/** A pulsing placeholder block for content mid-fetch — used in list skeletons on
 * Home/Jobs so the first paint isn't a blank screen while React Query's first
 * request is in flight. */
export function Skeleton({ className, style, ...props }: ViewProps) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      className={cn('rounded-md bg-muted', className)}
      style={[animatedStyle, style]}
      {...props}
    />
  );
}
