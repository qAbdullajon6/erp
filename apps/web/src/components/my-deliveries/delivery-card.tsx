import type { MyDelivery } from '@/lib/api/my-deliveries';

interface DeliveryCardProps {
  delivery: MyDelivery;
  onClick: () => void;
}

/// Wording, not rules. Which of these a driver may move to comes from the server
/// (Task 8.12) — this map only decides what the stage is CALLED.
const STATUS_LABELS: Record<string, string> = {
  ASSIGNED: 'Assigned',
  EN_ROUTE_TO_PICKUP: 'On the way to pickup',
  AT_PICKUP: 'At pickup',
  IN_TRANSIT: 'In transit',
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
    case 'AT_PICKUP':
    case 'EN_ROUTE_TO_PICKUP':
      return 'bg-brand/10 text-brand';
    default:
      return 'bg-warning/10 text-warning';
  }
}

/// The driver's job card. Since Task 8.12 it shows the DISPATCH — the operational
/// record they are actually executing — with the order nested inside it as context.
/// The price is gone: it is the customer's commercial business, not the driver's,
/// and it was only ever on here because this card used to be an order.
export function DeliveryCard({ delivery, onClick }: DeliveryCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl border border-brand/10 bg-surface p-4 text-left transition-colors hover:border-brand/30 active:bg-background/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold text-foreground">
              {delivery.dispatchNumber}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {delivery.order.orderNumber}
            </span>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {delivery.order.pickupCity} → {delivery.order.deliveryCity}
          </p>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {delivery.customer.companyName}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(delivery.status)}`}
        >
          {STATUS_LABELS[delivery.status] ?? delivery.status}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-brand/5 pt-3 text-xs text-muted-foreground">
        <span>Pickup {new Date(delivery.pickupDateScheduled).toLocaleDateString()}</span>
        <span>Delivery {new Date(delivery.deliveryDateScheduled).toLocaleDateString()}</span>
      </div>
    </button>
  );
}
