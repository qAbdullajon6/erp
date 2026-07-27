import { forwardRef } from 'react';
import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/tokens';

const buttonVariants = cva('flex-row items-center justify-center rounded-lg active:opacity-80', {
  variants: {
    variant: {
      primary: 'bg-primary',
      secondary: 'bg-secondary',
      destructive: 'bg-destructive',
      outline: 'border border-border bg-transparent',
      ghost: 'bg-transparent',
    },
    size: {
      sm: 'h-9 px-3',
      md: 'h-12 px-4',
      lg: 'h-14 px-6',
      icon: 'h-11 w-11',
    },
    disabled: {
      true: 'opacity-40',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
});

const labelVariants = cva('font-display text-base font-semibold', {
  variants: {
    variant: {
      primary: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      destructive: 'text-destructive-foreground',
      outline: 'text-foreground',
      ghost: 'text-foreground',
    },
    size: {
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
      icon: 'text-base',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
});

const spinnerColor: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: colors.primaryForeground,
  secondary: colors.secondaryForeground,
  destructive: colors.destructiveForeground,
  outline: colors.foreground,
  ghost: colors.foreground,
};

export interface ButtonProps
  extends Omit<PressableProps, 'disabled'>,
    VariantProps<typeof buttonVariants> {
  label?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

/** The one pressable primitive every screen should reach for — haptic feedback on
 * every tap is what makes a list of status buttons feel like a native app instead
 * of a web view, and putting it here means no screen has to remember to add it. */
export const Button = forwardRef<React.ComponentRef<typeof Pressable>, ButtonProps>(
  ({ label, children, variant, size, disabled, loading, className, onPress, ...props }, ref) => {
    return (
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled || loading) }}
        disabled={disabled || loading}
        onPress={(event) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress?.(event);
        }}
        className={cn(buttonVariants({ variant, size, disabled: disabled || loading }), className)}
        {...props}
      >
        {loading ? (
          <ActivityIndicator size="small" color={spinnerColor[variant ?? 'primary']} />
        ) : children ? (
          children
        ) : (
          <Text className={labelVariants({ variant, size })}>{label}</Text>
        )}
      </Pressable>
    );
  },
);
Button.displayName = 'Button';
