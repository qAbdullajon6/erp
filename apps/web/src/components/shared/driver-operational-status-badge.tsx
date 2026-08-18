'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type DriverOperationalStatusValue =
  | 'AVAILABLE'
  | 'BUSY'
  | 'DRIVING'
  | 'LOADING'
  | 'BREAK'
  | 'OFFLINE'
  | string;

const LABELS: Record<string, string> = {
  AVAILABLE: 'Available',
  BUSY: 'Busy',
  DRIVING: 'Driving',
  LOADING: 'Loading',
  BREAK: 'On break',
  OFFLINE: 'Offline',
};

const VARIANTS: Record<string, string> = {
  AVAILABLE: 'border-transparent bg-success/15 text-success',
  BUSY: 'border-transparent bg-brand/15 text-brand',
  DRIVING: 'border-transparent bg-brand/15 text-brand',
  LOADING: 'border-transparent bg-warning/15 text-warning',
  BREAK: 'border-transparent bg-warning/15 text-warning',
  OFFLINE: 'border-transparent bg-muted text-muted-foreground',
};

export function driverOperationalStatusLabel(status: DriverOperationalStatusValue): string {
  return LABELS[status] ?? String(status).replace(/_/g, ' ');
}

export function DriverOperationalStatusBadge({
  status,
  onBreak,
  className,
}: {
  status: DriverOperationalStatusValue;
  onBreak?: boolean;
  className?: string;
}) {
  const effective = onBreak && status !== 'BREAK' ? 'BREAK' : status;
  const hint = onBreak && status !== 'BREAK' ? ' · break' : '';

  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium',
        VARIANTS[effective] ?? 'border-transparent bg-muted text-muted-foreground',
        className,
      )}
    >
      {driverOperationalStatusLabel(effective)}
      {hint}
    </Badge>
  );
}
