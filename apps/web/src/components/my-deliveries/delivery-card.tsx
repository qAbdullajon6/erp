import { formatMoney } from '@/lib/format';
import type { MyDelivery } from '@/lib/api/my-deliveries';

interface DeliveryCardProps {
  delivery: MyDelivery;
  onClick: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  ASSIGNED: 'Assigned',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'DELIVERED':
      return 'bg-success/10 text-success';
    case 'CANCELLED':
      return 'bg-destructive/10 text-destructive';
    case 'IN_TRANSIT':
    case 'PICKED_UP':
      return 'bg-brand/10 text-brand';
    default:
      return 'bg-warning/10 text-warning';
  }
}

export function DeliveryCard({ delivery, onClick }: DeliveryCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl border border-brand/10 bg-surface p-4 text-left transition-colors hover:border-brand/30 active:bg-background/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{delivery.orderNumber}</span>
            {delivery.isDelayed && (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Delayed</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {delivery.pickupCity} → {delivery.deliveryCity}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{delivery.customer.companyName}</p>
        </div>
        <div className="text-right">
          <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(delivery.status)}`}>
            {STATUS_LABELS[delivery.status] ?? delivery.status}
          </span>
          <p className="mt-2 text-sm font-semibold text-foreground">{formatMoney(delivery.price, delivery.currency)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-brand/5 pt-3 text-xs text-muted-foreground">
        <span>Pickup {new Date(delivery.pickupDate).toLocaleDateString()}</span>
        <span>Delivery {new Date(delivery.deliveryDate).toLocaleDateString()}</span>
      </div>
    </button>
  );
}
