export type CustomerTimelineKind = 'ORDER' | 'DISPATCH';

export interface CustomerTimelineEventInput {
  id: string;
  kind: CustomerTimelineKind;
  status: string;
  note?: string | null;
  createdAt: string | Date;
}

export interface CustomerTimelineEvent {
  id: string;
  kind: CustomerTimelineKind;
  status: string;
  label: string;
  note: string | null;
  createdAt: string | Date;
}

const ORDER_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  ASSIGNED: 'Assigned',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const DISPATCH_LABELS: Record<string, string> = {
  ASSIGNED: 'Assigned',
  EN_ROUTE_TO_PICKUP: 'On the way to pickup',
  AT_PICKUP: 'At pickup',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export function customerOrderStatusLabel(status: string): string | null {
  if (status === 'DRAFT') return null;
  return ORDER_LABELS[status] ?? null;
}

export function customerDispatchStatusLabel(status: string): string | null {
  if (status === 'DRAFT') return null;
  return DISPATCH_LABELS[status] ?? null;
}

export function customerSafeTimelineNote(note: string | null | undefined): string | null {
  if (note == null || note.trim() === '') return null;
  const trimmed = note.trim();
  if (/^(audit|system|internal)[:\s-]/i.test(trimmed)) return null;
  if (/^\[(audit|system|internal)\]/i.test(trimmed)) return null;
  if (/actorUserId|changedByUserId|"from"\s*:/i.test(trimmed)) return null;
  return trimmed;
}

/** Pure mapper used by unit tests; API already returns `label`. */
export function buildCustomerTimelineEvents(
  inputs: CustomerTimelineEventInput[],
): CustomerTimelineEvent[] {
  const out: CustomerTimelineEvent[] = [];
  for (const row of inputs) {
    const label =
      row.kind === 'ORDER'
        ? customerOrderStatusLabel(row.status)
        : customerDispatchStatusLabel(row.status);
    if (!label) continue;
    out.push({
      id: row.id,
      kind: row.kind,
      status: row.status,
      label,
      note: customerSafeTimelineNote(row.note),
      createdAt: row.createdAt,
    });
  }
  return out;
}
