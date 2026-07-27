import { Text, View } from 'react-native';
import { cn } from '@/lib/utils';

type BadgeVariant = 'success' | 'warning' | 'muted' | 'brand' | 'danger';

/** Same status -> color grouping as apps/web/src/components/shared/status-badge.tsx:
 * terminal-good is success, in-flight is brand, waiting is warning,
 * failed/cancelled is danger. Only the statuses this app actually renders
 * (dispatch lifecycle) are listed — the web app's list also covers orders,
 * vehicles, finance, etc. that this app has no screens for yet. */
const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  DRAFT: 'muted',
  ASSIGNED: 'brand',
  EN_ROUTE_TO_PICKUP: 'brand',
  AT_PICKUP: 'brand',
  IN_TRANSIT: 'brand',
  DELIVERED: 'success',
  CANCELLED: 'danger',
  DELAYED: 'danger',
  ACTIVE: 'success',
  ON_LEAVE: 'warning',
};

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  muted: 'bg-muted text-muted-foreground',
  brand: 'bg-primary/15 text-primary',
  danger: 'bg-destructive/15 text-destructive',
};

export function statusVariant(status: string): BadgeVariant {
  return STATUS_VARIANTS[status] ?? 'muted';
}

/** Renders `IN_TRANSIT` as `In Transit`. */
export function statusLabel(status: string): string {
  return status
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const variant = statusVariant(status);
  return (
    <View className={cn('self-start rounded-full px-2.5 py-1', VARIANT_CLASSES[variant].split(' ')[0], className)}>
      <Text className={cn('text-xs font-semibold', VARIANT_CLASSES[variant].split(' ')[1])}>
        {statusLabel(status)}
      </Text>
    </View>
  );
}
