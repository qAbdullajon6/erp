import { Text, View, type ViewProps } from 'react-native';
import { cn } from '@/lib/utils';

export interface SectionProps extends ViewProps {
  title?: string;
  action?: React.ReactNode;
}

/** A labeled block of content — the "Today" / "Active Job" / "Recent Deliveries"
 * groupings on Home, Jobs, and Account. Keeps section-title typography in one
 * place instead of every screen re-declaring the same `text-sm font-semibold
 * uppercase text-muted-foreground` line. */
export function Section({ title, action, className, children, ...props }: SectionProps) {
  return (
    <View className={cn('gap-3', className)} {...props}>
      {(title || action) && (
        <View className="flex-row items-center justify-between">
          {title ? (
            <Text className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</Text>
          ) : (
            <View />
          )}
          {action}
        </View>
      )}
      {children}
    </View>
  );
}
