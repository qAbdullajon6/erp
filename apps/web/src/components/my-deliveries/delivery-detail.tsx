import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Phone, MapPin, Navigation } from 'lucide-react';
import { describeError } from '@/lib/api/describe-error';
import {
  useMyDeliveryQuery,
  useUpdateMyDeliveryStatusMutation,
  type DriverActionableStatus,
} from '@/lib/api/my-deliveries';
import { LoadingState, ErrorState } from '@/components/shared/list-states';
import { ShareLocationButton } from './share-location-button';

interface DeliveryDetailProps {
  deliveryId: string;
  onBack: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  ASSIGNED: 'Assigned',
  EN_ROUTE_TO_PICKUP: 'On the way to pickup',
  AT_PICKUP: 'At pickup',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const ACTION_LABEL: Record<DriverActionableStatus, string> = {
  EN_ROUTE_TO_PICKUP: 'On my way to pickup',
  AT_PICKUP: 'Arrived at pickup',
  IN_TRANSIT: 'Loaded — on the road',
  DELIVERED: 'Mark as Delivered',
};

const LIVE_STATUSES = new Set(['ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT']);

function mapLink(address: string, city: string): string | null {
  const query = [address, city].filter(Boolean).join(', ');
  if (!query.trim()) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function navLink(address: string, city: string): string | null {
  const query = [address, city].filter(Boolean).join(', ');
  if (!query.trim()) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}

export function DeliveryDetail({ deliveryId, onBack }: DeliveryDetailProps) {
  const { data: delivery, isLoading, isError, error, refetch } = useMyDeliveryQuery(deliveryId);
  const { mutateAsync, isPending } = useUpdateMyDeliveryStatusMutation(deliveryId);

  const handleAdvanceStatus = async (next: DriverActionableStatus) => {
    try {
      await mutateAsync({ status: next });
      toast.success(`Marked as ${STATUS_LABELS[next]}`);
    } catch (err) {
      toast.error(describeError(err, 'Failed to update status'));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <LoadingState label="Loading job…" />
      </div>
    );
  }

  if (isError || !delivery) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load delivery'}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const canShareLocation = LIVE_STATUSES.has(delivery.status);
  const pickupNav = navLink(delivery.order.pickupAddress, delivery.order.pickupCity);
  const deliveryNav = navLink(delivery.order.deliveryAddress, delivery.order.deliveryCity);
  const nextStopNav =
    delivery.status === 'ASSIGNED' || delivery.status === 'EN_ROUTE_TO_PICKUP' || delivery.status === 'AT_PICKUP'
      ? pickupNav
      : deliveryNav;

  return (
    <div className="space-y-4 pb-36">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-brand"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to jobs
      </button>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold text-foreground">{delivery.dispatchNumber}</h1>
            <p className="mt-1 font-mono text-sm text-muted-foreground">{delivery.order.orderNumber}</p>
          </div>
          <span className="shrink-0 rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand">
            {STATUS_LABELS[delivery.status] ?? delivery.status}
          </span>
        </div>
        {nextStopNav ? (
          <a
            href={nextStopNav}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground"
          >
            <Navigation className="h-4 w-4" />
            Navigate to next stop
          </a>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pickup</h2>
        <p className="mt-2 font-medium text-foreground">
          {delivery.order.pickupAddress}, {delivery.order.pickupCity}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date(delivery.pickupDateScheduled).toLocaleString()}
        </p>
        {mapLink(delivery.order.pickupAddress, delivery.order.pickupCity) ? (
          <a
            href={mapLink(delivery.order.pickupAddress, delivery.order.pickupCity)!}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground"
          >
            <MapPin className="h-4 w-4" />
            Open pickup in Maps
          </a>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Delivery</h2>
        <p className="mt-2 font-medium text-foreground">
          {delivery.order.deliveryAddress}, {delivery.order.deliveryCity}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date(delivery.deliveryDateScheduled).toLocaleString()}
        </p>
        {delivery.order.deliveryNotes ? (
          <p className="mt-2 text-sm text-muted-foreground">Note: {delivery.order.deliveryNotes}</p>
        ) : null}
        {mapLink(delivery.order.deliveryAddress, delivery.order.deliveryCity) ? (
          <a
            href={mapLink(delivery.order.deliveryAddress, delivery.order.deliveryCity)!}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground"
          >
            <MapPin className="h-4 w-4" />
            Open delivery in Maps
          </a>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Customer</h2>
        <p className="mt-2 font-medium text-foreground">{delivery.customer.companyName}</p>
        <p className="text-sm text-muted-foreground">{delivery.customer.contactName}</p>
        {delivery.customer.deliveryNotes ? (
          <p className="mt-2 text-sm text-muted-foreground">Note: {delivery.customer.deliveryNotes}</p>
        ) : null}
        {delivery.customer.phone ? (
          <a
            href={`tel:${delivery.customer.phone}`}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground"
          >
            <Phone className="h-4 w-4" />
            {delivery.customer.phone}
          </a>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Cargo</h2>
        <p className="mt-2 text-foreground">{delivery.order.cargoDescription}</p>
        <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
          {delivery.order.cargoWeightKg ? <span>{delivery.order.cargoWeightKg} kg</span> : null}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Vehicle: {delivery.vehicle.plateNumber} ({delivery.vehicle.type})
        </p>
        {delivery.notes ? <p className="mt-2 text-sm text-muted-foreground">Note: {delivery.notes}</p> : null}
      </div>

      {delivery.statusHistory && delivery.statusHistory.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Status timeline</h2>
          <div className="mt-3 space-y-3">
            {delivery.statusHistory.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start justify-between border-b border-border/60 pb-2 last:border-0"
              >
                <span className="text-sm font-medium text-foreground">
                  {STATUS_LABELS[entry.status] ?? entry.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          <ShareLocationButton enabled={canShareLocation} />
          {delivery.allowedTransitions.map((next) => (
            <Button
              key={next}
              size="lg"
              onClick={() => void handleAdvanceStatus(next)}
              disabled={isPending}
              className="w-full gap-2 bg-gradient-brand py-6 text-base text-brand-foreground hover:opacity-90"
            >
              {isPending ? 'Updating…' : ACTION_LABEL[next]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
