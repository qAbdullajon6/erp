/// Customer-facing status labels for the portal timeline.
/// Mirrored on the web in `lib/customer/customer-timeline.builder.ts` for unit tests.

const ORDER_LABELS: Record<string, string> = {
  PENDING: "Pending",
  ASSIGNED: "Assigned",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const DISPATCH_LABELS: Record<string, string> = {
  ASSIGNED: "Assigned",
  EN_ROUTE_TO_PICKUP: "On the way to pickup",
  AT_PICKUP: "At pickup",
  IN_TRANSIT: "In transit",
  ARRIVED_AT_DELIVERY: "Arrived at destination",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  DELIVERY_FAILED: "Delivery attempted",
};

export function customerOrderStatusLabel(status: string): string | null {
  if (status === "DRAFT") return null;
  return ORDER_LABELS[status] ?? null;
}

export function customerDispatchStatusLabel(status: string): string | null {
  if (status === "DRAFT") return null;
  return DISPATCH_LABELS[status] ?? null;
}

/// Maps a dispatch status to the single customer-visible status string shown in
/// the shipment summary (GET /customer-portal/orders/:id). This differs from
/// customerDispatchStatusLabel in one case: AT_STOP is an internal intermediate
/// state that the timeline silently skips, but the shipment summary must always
/// carry a status — so AT_STOP maps to "In transit", matching the order
/// projection (AT_STOP dispatch → order IN_TRANSIT).
export function customerShipmentStatusLabel(status: string): string | null {
  if (status === "AT_STOP") return "In transit";
  return customerDispatchStatusLabel(status);
}

/// Hide dispatcher/system audit crumbs from the customer-visible note field.
export function customerSafeTimelineNote(note: string | null | undefined): string | null {
  if (note == null || note.trim() === "") return null;
  const trimmed = note.trim();
  if (/^(audit|system|internal)[:\s-]/i.test(trimmed)) return null;
  if (/^\[(audit|system|internal)\]/i.test(trimmed)) return null;
  if (/actorUserId|changedByUserId|"from"\s*:/i.test(trimmed)) return null;
  return trimmed;
}
