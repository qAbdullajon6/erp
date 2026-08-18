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
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export function customerOrderStatusLabel(status: string): string | null {
  if (status === "DRAFT") return null;
  return ORDER_LABELS[status] ?? null;
}

export function customerDispatchStatusLabel(status: string): string | null {
  if (status === "DRAFT") return null;
  return DISPATCH_LABELS[status] ?? null;
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
