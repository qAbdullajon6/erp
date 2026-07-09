import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Phone, MapPin } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import {
  useMyDeliveryQuery,
  useUpdateMyDeliveryStatusMutation,
  type DriverActionableStatus,
  type DriverOrderStatus,
} from '@/lib/api/my-deliveries';

interface DeliveryDetailProps {
  deliveryId: string;
  onBack: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  ASSIGNED: 'Assigned',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

// Mirrors the backend's ALLOWED_TRANSITIONS + DRIVER_ALLOWED_STATUSES
// exactly (see OrdersService) — ASSIGNED and CANCELLED are never reachable
// from here, only the forward driver-safe path.
const NEXT_STATUS: Partial<Record<DriverOrderStatus, { status: DriverActionableStatus; label: string }>> = {
  ASSIGNED: { status: 'PICKED_UP', label: 'Mark as Picked Up' },
  PICKED_UP: { status: 'IN_TRANSIT', label: 'Mark as In Transit' },
  IN_TRANSIT: { status: 'DELIVERED', label: 'Mark as Delivered' },
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
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
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
              <h1 className="font-display text-xl font-bold text-foreground">{delivery.orderNumber}</h1>
              <span className="rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand">
                {STATUS_LABELS[delivery.status] ?? delivery.status}
              </span>
            </div>
            {delivery.isDelayed && (
              <p className="mt-2 text-sm font-medium text-destructive">This delivery is running late.</p>
            )}
            <p className="mt-3 text-2xl font-bold text-foreground">{formatMoney(delivery.price, delivery.currency)}</p>
          </div>

          <div className="rounded-xl border border-brand/10 bg-surface p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pickup</h2>
            <p className="mt-2 font-medium text-foreground">
              {delivery.pickupAddress}, {delivery.pickupCity}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{new Date(delivery.pickupDate).toLocaleString()}</p>
            {mapLink(delivery.pickupAddress, delivery.pickupCity) && (
              <a
                href={mapLink(delivery.pickupAddress, delivery.pickupCity)!}
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
              {delivery.deliveryAddress}, {delivery.deliveryCity}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{new Date(delivery.deliveryDate).toLocaleString()}</p>
            {delivery.deliveryNotes && <p className="mt-2 text-sm text-muted-foreground">Note: {delivery.deliveryNotes}</p>}
            {mapLink(delivery.deliveryAddress, delivery.deliveryCity) && (
              <a
                href={mapLink(delivery.deliveryAddress, delivery.deliveryCity)!}
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
            <p className="mt-2 text-foreground">{delivery.cargoDescription}</p>
            <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
              {delivery.cargoWeightKg && <span>{delivery.cargoWeightKg} kg</span>}
              {delivery.cargoVolumeM3 && <span>{delivery.cargoVolumeM3} m³</span>}
            </div>
            {delivery.vehicle && (
              <p className="mt-2 text-sm text-muted-foreground">
                Vehicle: {delivery.vehicle.plateNumber} ({delivery.vehicle.type})
              </p>
            )}
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

          {NEXT_STATUS[delivery.status] && (
            <Button
              size="lg"
              onClick={() => handleAdvanceStatus(NEXT_STATUS[delivery.status]!.status)}
              disabled={isPending}
              className="w-full gap-2 bg-gradient-brand py-6 text-base text-brand-foreground hover:opacity-90"
            >
              {isPending ? 'Updating...' : NEXT_STATUS[delivery.status]!.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
