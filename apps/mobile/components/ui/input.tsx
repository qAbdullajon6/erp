import { forwardRef, useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/tokens';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  /** Renders a show/hide toggle instead of relying on the OS's own reveal (not all
   * Android keyboards offer one, and consistency across platforms matters more
   * here than saving one prop on the two screens that need it). */
  isPassword?: boolean;
}

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, error, isPassword, secureTextEntry, className, ...props }, ref) => {
    const [hidden, setHidden] = useState(Boolean(isPassword));

    return (
      <View className="gap-1.5">
        {label && <Text className="text-sm font-medium text-foreground">{label}</Text>}
        <View className="relative justify-center">
          <TextInput
            ref={ref}
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry={isPassword ? hidden : secureTextEntry}
            className={cn(
              'h-12 rounded-lg border bg-secondary px-4 text-base text-foreground',
              error ? 'border-destructive' : 'border-border',
              isPassword && 'pr-12',
              className,
            )}
            {...props}
          />
          {isPassword && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 h-10 w-10"
              accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
              onPress={() => setHidden((value) => !value)}
            >
              {hidden ? (
                <Eye color={colors.mutedForeground} size={20} />
              ) : (
                <EyeOff color={colors.mutedForeground} size={20} />
              )}
            </Button>
          )}
        </View>
        {error && <Text className="text-sm text-destructive">{error}</Text>}
      </View>
    );
  },
);
Input.displayName = 'Input';
