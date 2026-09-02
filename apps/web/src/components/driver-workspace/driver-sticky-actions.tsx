'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { DriverActionableStatus } from '@/lib/api/my-deliveries';
import { ShareLocationButton } from '@/components/my-deliveries/share-location-button';

const ACTION_LABEL: Record<DriverActionableStatus, string> = {
  EN_ROUTE_TO_PICKUP: 'Start trip',
  AT_PICKUP: 'Arrived',
  IN_TRANSIT: 'Loaded',
  AT_STOP: 'Arrived at stop',
  ARRIVED_AT_DELIVERY: 'Arrived at delivery',
  DELIVERED: 'Delivered',
};

interface Props {
  allowedTransitions: DriverActionableStatus[];
  canShareLocation: boolean;
  isPending: boolean;
  onAdvance: (next: DriverActionableStatus) => void;
  extraActions?: ReactNode;
  deliveredDisabled?: boolean;
  currentStatus?: string;
  onFailureReport?: () => void;
}

export function DriverStickyActions({
  allowedTransitions,
  canShareLocation,
  isPending,
  onAdvance,
  extraActions,
  deliveredDisabled,
  currentStatus,
  onFailureReport,
}: Props) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-lg flex-col gap-2">
        <ShareLocationButton enabled={canShareLocation} />
        {extraActions}
        {allowedTransitions.map((next) => (
          <Button
            key={next}
            size="lg"
            onClick={() => onAdvance(next)}
            disabled={isPending || (next === 'DELIVERED' && !!deliveredDisabled)}
            className="w-full gap-2 bg-gradient-brand py-6 text-base text-brand-foreground hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? 'Updating…' : (next === 'IN_TRANSIT' && currentStatus === 'AT_STOP' ? 'Continue' : ACTION_LABEL[next])}
          </Button>
        ))}
        {currentStatus === 'AT_STOP' && onFailureReport ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onFailureReport}
            disabled={isPending}
            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            Can&apos;t complete this stop
          </Button>
        ) : null}
      </div>
    </div>
  );
}
