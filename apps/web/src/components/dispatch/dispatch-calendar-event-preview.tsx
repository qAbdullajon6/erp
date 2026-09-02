'use client';

import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { ArrowRight, MapPin, Truck, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { statusLabel } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';
import {
  CALENDAR_STATUS_DOT,
  driverShortName,
  type CalendarEvent,
} from './dispatch-calendar-utils';

interface DispatchCalendarEventPreviewProps {
  event: CalendarEvent;
  onQuickOpen?: () => void;
  className?: string;
}

export function DispatchCalendarEventPreview({
  event,
  onQuickOpen,
  className,
}: DispatchCalendarEventPreviewProps) {
  const { dispatch } = event;
  const driver = driverShortName(dispatch);
  const plate = dispatch.vehicle?.plateNumber;
  const customer = dispatch.order?.customer?.companyName;

  return (
    <div
      className={cn(
        'w-72 rounded-lg border border-white/[0.08] bg-surface-elevated p-3 shadow-xl',
        'animate-in fade-in-0 zoom-in-95 duration-150',
        className,
      )}
      data-testid={`calendar-event-hover-${dispatch.dispatchNumber}`}
    >
      <div className="flex items-center gap-2 border-b border-white/[0.08] pb-2.5">
        <span
          className={cn('h-2.5 w-2.5 shrink-0 rounded-full', CALENDAR_STATUS_DOT[dispatch.status])}
          aria-hidden="true"
        />
        <p className="font-display text-sm font-bold text-foreground">{dispatch.dispatchNumber}</p>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {statusLabel(dispatch.status)}
        </span>
      </div>

      <dl className="mt-2.5 space-y-2 text-sm">
        <PreviewRow label="Customer" value={customer ?? '—'} />
        <PreviewRow
          label="Driver"
          value={driver}
          icon={<User className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />}
        />
        <PreviewRow
          label="Vehicle"
          value={plate ?? '—'}
          icon={<Truck className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />}
        />
        <PreviewRow
          label="Route"
          value={`${dispatch.order?.pickupCity ?? '—'} → ${dispatch.order?.deliveryCity ?? '—'}`}
          icon={<MapPin className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />}
        />
        <PreviewRow label="Pickup" value={format(event.start, 'EEE, MMM d · HH:mm')} />
        <PreviewRow label="Delivery" value={format(event.end, 'EEE, MMM d · HH:mm')} />
        <PreviewRow label="ETA" value={format(event.end, 'HH:mm')} />
      </dl>

      {onQuickOpen ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-3 h-8 w-full text-xs transition-all duration-150 hover:bg-brand/15 hover:text-brand"
          onClick={(e) => {
            e.stopPropagation();
            onQuickOpen();
          }}
        >
          Quick open
          <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      ) : null}
    </div>
  );
}

function PreviewRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="flex min-w-0 items-center justify-end gap-1 truncate text-right text-xs font-medium text-foreground">
        {icon}
        <span className="truncate">{value}</span>
      </dd>
    </div>
  );
}
