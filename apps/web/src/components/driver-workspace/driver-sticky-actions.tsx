'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { DriverActionableStatus } from '@/lib/api/my-deliveries';
import { ShareLocationButton } from '@/components/my-deliveries/share-location-button';

const ACTION_LABEL: Record<DriverActionableStatus, string> = {
  EN_ROUTE_TO_PICKUP: 'Start trip',
  AT_PICKUP: 'Arrived',
  IN_TRANSIT: 'Loaded',
  DELIVERED: 'Delivered',
};

interface Props {
  allowedTransitions: DriverActionableStatus[];
  canShareLocation: boolean;
  isPending: boolean;
  onAdvance: (next: DriverActionableStatus) => void;
  extraActions?: ReactNode;
}

export function DriverStickyActions({
  allowedTransitions,
  canShareLocation,
  isPending,
  onAdvance,
  extraActions,
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
            disabled={isPending}
            className="w-full gap-2 bg-gradient-brand py-6 text-base text-brand-foreground hover:opacity-90"
          >
            {isPending ? 'Updating…' : ACTION_LABEL[next]}
          </Button>
        ))}
      </div>
    </div>
  );
}
