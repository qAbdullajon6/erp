/// Maps a notification's `entityType` (from the backend's `Notification.entityType`
/// field) to a real, existing detail route. There is no `actionUrl` field on the
/// backend model — only `entityType`/`entityId` — so this list must stay in sync
/// with what routes actually exist. Deliberately returns null (no link shown) for
/// any entity type without a confirmed 1:1 detail route, e.g. "Invoice" — invoice
/// detail is a client-state Sheet inside /app/finance, not an addressable route,
/// so no navigable link is offered for it rather than guessing one.
export interface EntityLink {
  to: string;
  params: Record<string, string>;
  label: string;
}

export function getEntityLink(entityType: string | null, entityId: string | null): EntityLink | null {
  if (!entityType || !entityId) return null;

  switch (entityType) {
    case 'Order':
      return { to: '/app/orders/$orderId', params: { orderId: entityId }, label: 'View Order' };
    case 'Customer':
      return { to: '/app/customers/$customerId', params: { customerId: entityId }, label: 'View Customer' };
    case 'Vehicle':
      return { to: '/app/vehicles/$vehicleId', params: { vehicleId: entityId }, label: 'View Vehicle' };
    case 'Driver':
      return { to: '/app/drivers/$driverId', params: { driverId: entityId }, label: 'View Driver' };
    default:
      return null;
  }
}
