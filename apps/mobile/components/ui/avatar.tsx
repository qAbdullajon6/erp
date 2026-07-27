import { Text, View } from 'react-native';
import { cn } from '@/lib/utils';

export interface AvatarProps {
  firstName: string;
  lastName?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'h-8 w-8',
  md: 'h-11 w-11',
  lg: 'h-16 w-16',
} as const;

const TEXT_SIZE_CLASSES = {
  sm: 'text-xs',
  md: 'text-base',
  lg: 'text-xl',
} as const;

/** Initials only — the backend has no profile-photo field or upload endpoint for
 * either User or Driver (verified against apps/api/prisma/schema.prisma), so
 * anything else would be a placeholder image standing in for data that doesn't
 * exist yet. */
export function Avatar({ firstName, lastName, size = 'md', className }: AvatarProps) {
  const initials = `${firstName.charAt(0)}${lastName?.charAt(0) ?? ''}`.toUpperCase();

  return (
    <View
      className={cn('items-center justify-center rounded-full bg-accent', SIZE_CLASSES[size], className)}
    >
      <Text className={cn('font-display font-bold text-accent-foreground', TEXT_SIZE_CLASSES[size])}>
        {initials}
      </Text>
    </View>
  );
}
