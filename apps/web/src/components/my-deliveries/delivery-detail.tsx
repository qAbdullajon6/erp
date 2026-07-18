import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Phone, MapPin } from 'lucide-react';
import { describeError } from '@/lib/api/describe-error';
import {
  useMyDeliveryQuery,
  useUpdateMyDeliveryStatusMutation,
  type DriverActionableStatus,
} from '@/lib/api/my-deliveries';

interface DeliveryDetailProps {
  deliveryId: string;
  onBack: () => void;
}

/// Wording, not rules — the DISPATCH's stages, as a driver would say them.
const STATUS_LABELS: Record<string, string> = {
  ASSIGNED: 'Assigned',
  EN_ROUTE_TO_PICKUP: 'On the way to pickup',
  AT_PICKUP: 'At pickup',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

/// What each driver-safe move is CALLED on the button. Which of them is actually
/// OFFERED comes from the server, on the dispatch itself (Task 8.12). This file used
/// to mirror two backend tables at once; now it mirrors none.
///
/// EN_ROUTE_TO_PICKUP is new here. A driver could not previously record setting off —
/// the state existed on the dispatch, but only the order API was reachable, and it
/// walked through EN_ROUTE_TO_PICKUP silently on their behalf when they finally
/// arrived, stamping it with the wrong time.
const ACTION_LABEL: Record<DriverActionableStatus, string> = {
  EN_ROUTE_TO_PICKUP: 'On my way to pickup',
  AT_PICKUP: 'Arrived at pickup',
  IN_TRANSIT: 'Loaded — on the road',
  DELIVERED: 'Mark as Delivered',
};

function mapLink(address: string, city: string): string | null {
  const query = [address, city].filter(Boolean).join(', ');
  if (!query.trim()) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
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

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-brand">
        <ArrowLeft className="h-4 w-4" />
        Back to deliveries
      </button>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      )}

      {isError && !isLoading && (
        <div className="rounded-lg bg-destructive/10 p-6 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load delivery'}
          <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">
            Retry
          </Button>
        </div>
      )}

      {delivery && (
        <div className="space-y-4">
          <div className="rounded-xl border border-brand/10 bg-surface p-5">
            <div className="flex items-center justify-between">
              <h1 className="font-display text-xl font-bold text-foreground">
                {delivery.dispatchNumber}
              </h1>
              <span className="rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand">
                {STATUS_LABELS[delivery.status] ?? delivery.status}
              </span>
            </div>
            <p className="mt-2 font-mono text-sm text-muted-foreground">
              {delivery.order.orderNumber}
            </p>
          </div>

          <div className="rounded-xl border border-brand/10 bg-surface p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pickup</h2>
            <p className="mt-2 font-medium text-foreground">
              {delivery.order.pickupAddress}, {delivery.order.pickupCity}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{new Date(delivery.pickupDateScheduled).toLocaleString()}</p>
            {mapLink(delivery.order.pickupAddress, delivery.order.pickupCity) && (
              <a
                href={mapLink(delivery.order.pickupAddress, delivery.order.pickupCity)!}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand/10 px-4 py-2 text-sm font-medium text-brand"
              >
                <MapPin className="h-4 w-4" />
                Open in Maps
              </a>
            )}
          </div>

          <div className="rounded-xl border border-brand/10 bg-surface p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Delivery</h2>
            <p className="mt-2 font-medium text-foreground">
              {delivery.order.deliveryAddress}, {delivery.order.deliveryCity}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{new Date(delivery.deliveryDateScheduled).toLocaleString()}</p>
            {delivery.order.deliveryNotes && <p className="mt-2 text-sm text-muted-foreground">Note: {delivery.order.deliveryNotes}</p>}
            {mapLink(delivery.order.deliveryAddress, delivery.order.deliveryCity) && (
              <a
                href={mapLink(delivery.order.deliveryAddress, delivery.order.deliveryCity)!}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand/10 px-4 py-2 text-sm font-medium text-brand"
              >
                <MapPin className="h-4 w-4" />
                Open in Maps
              </a>
            )}
          </div>

          <div className="rounded-xl border border-brand/10 bg-surface p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Customer</h2>
            <p className="mt-2 font-medium text-foreground">{delivery.customer.companyName}</p>
            <p className="text-sm text-muted-foreground">{delivery.customer.contactName}</p>
            {delivery.customer.deliveryNotes && (
              <p className="mt-2 text-sm text-muted-foreground">Note: {delivery.customer.deliveryNotes}</p>
            )}
            {delivery.customer.phone && (
              <a
                href={`tel:${delivery.customer.phone}`}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand/10 px-4 py-2 text-sm font-medium text-brand"
              >
                <Phone className="h-4 w-4" />
                {delivery.customer.phone}
              </a>
            )}
          </div>

          <div className="rounded-xl border border-brand/10 bg-surface p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Cargo</h2>
            <p className="mt-2 text-foreground">{delivery.order.cargoDescription}</p>
            <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
              {delivery.order.cargoWeightKg && <span>{delivery.order.cargoWeightKg} kg</span>}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Vehicle: {delivery.vehicle.plateNumber} ({delivery.vehicle.type})
            </p>
            {delivery.notes && <p className="mt-2 text-sm text-muted-foreground">Note: {delivery.notes}</p>}
          </div>

          {delivery.statusHistory && delivery.statusHistory.length > 0 && (
            <div className="rounded-xl border border-brand/10 bg-surface p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Status Timeline</h2>
              <div className="mt-3 space-y-3">
                {delivery.statusHistory.map((entry) => (
                  <div key={entry.id} className="flex items-start justify-between border-b border-brand/5 pb-2 last:border-0">
                    <span className="text-sm font-medium text-foreground">{STATUS_LABELS[entry.status] ?? entry.status}</span>
                    <span className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* The server already narrowed this to what a DRIVER may do from here, so
              there is nothing to filter and nothing to decide (TD-006). */}
          {delivery.allowedTransitions.map((next) => (
            <Button
              key={next}
              size="lg"
              onClick={() => handleAdvanceStatus(next)}
              disabled={isPending}
              className="w-full gap-2 bg-gradient-brand py-6 text-base text-brand-foreground hover:opacity-90"
            >
              {isPending ? 'Updating...' : ACTION_LABEL[next]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
