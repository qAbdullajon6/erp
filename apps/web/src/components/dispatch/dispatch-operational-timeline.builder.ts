import type { AuditLogEntry } from '@/lib/api/audit-logs';
import type { ApiDispatch } from '@/lib/api/dispatches';
import type { Invoice } from '@/lib/api/invoices';
import { formatDateTime, formatMoney } from '@/lib/format';
import { statusLabel } from '@/components/shared/status-badge';

export type TimelineFilterCategory =
  | 'all'
  | 'status'
  | 'documents'
  | 'notes'
  | 'finance'
  | 'gps'
  | 'assignment';

export type TimelineEventKind =
  | 'create'
  | 'edit'
  | 'assignment'
  | 'status'
  | 'document'
  | 'invoice'
  | 'payment'
  | 'conflict'
  | 'gps'
  | 'note'
  | 'undo'
  | 'archive'
  | 'restore'
  | 'schedule'
  | 'cancel';

export type TimelineEventCategory = Exclude<TimelineFilterCategory, 'all'>;

export interface TimelineFieldDiff {
  label: string;
  from: string;
  to: string;
}

export interface OperationalTimelineEvent {
  id: string;
  at: string;
  title: string;
  subtitle?: string | null;
  actor?: string | null;
  kind: TimelineEventKind;
  categories: TimelineEventCategory[];
  diffs?: TimelineFieldDiff[];
  fieldLabels?: string[];
  detail?: string | null;
  searchText: string;
  groupedCount?: number;
  /** Stable sort hint for equal timestamps (higher = later in lifecycle). */
  sequence?: number;
}

export interface BuildDispatchTimelineContext {
  dispatch: ApiDispatch;
  dispatchAuditLogs: AuditLogEntry[];
  orderAuditLogs?: AuditLogEntry[];
  invoiceAuditLogs?: AuditLogEntry[];
  invoice?: Invoice | null;
  resolveDriverName?: (id: string | null | undefined) => string;
  resolveVehiclePlate?: (id: string | null | undefined) => string;
  /** Collapse same-kind updates within this window (ms). Default 60_000. */
  groupWindowMs?: number;
}

const DISPATCH_FIELD_LABELS: Record<string, string> = {
  notes: 'Notes',
  driverId: 'Driver',
  vehicleId: 'Vehicle',
  pickupDateScheduled: 'Pickup',
  deliveryDateScheduled: 'Delivery',
};

const GPS_STATUS = new Set([
  'EN_ROUTE_TO_PICKUP',
  'AT_PICKUP',
  'IN_TRANSIT',
  'DELIVERED',
]);

const STATUS_SEQUENCE: Record<string, number> = {
  DRAFT: 0,
  ASSIGNED: 1,
  EN_ROUTE_TO_PICKUP: 2,
  AT_PICKUP: 3,
  IN_TRANSIT: 4,
  DELIVERED: 5,
  CANCELLED: 6,
};

function actorLabel(entry: AuditLogEntry): string | null {
  if (!entry.actor) return 'System';
  return `${entry.actor.firstName} ${entry.actor.lastName}`.trim();
}

function formatValue(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return formatDateTime(value);
    }
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '[complex value]';
  }
}

function formatStatus(value: unknown): string {
  if (typeof value !== 'string') return formatValue(value);
  return statusLabel(value);
}

function resolveEntityName(
  field: string,
  value: unknown,
  ctx: BuildDispatchTimelineContext,
): string {
  if (field === 'driverId' && ctx.resolveDriverName) {
    return ctx.resolveDriverName(typeof value === 'string' ? value : null);
  }
  if (field === 'vehicleId' && ctx.resolveVehiclePlate) {
    return ctx.resolveVehiclePlate(typeof value === 'string' ? value : null);
  }
  return formatValue(value);
}

function buildSearchText(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function eventTimeMs(at: string): number {
  const t = Date.parse(at);
  return Number.isFinite(t) ? t : 0;
}

/** Newest first. Equal timestamps → later lifecycle status first. */
export function sortTimelineEventsDesc(
  events: OperationalTimelineEvent[],
): OperationalTimelineEvent[] {
  return [...events].sort((a, b) => {
    const dt = eventTimeMs(b.at) - eventTimeMs(a.at);
    if (dt !== 0) return dt;
    return (b.sequence ?? 0) - (a.sequence ?? 0);
  });
}

/**
 * Collapse multiple diffs for the same field into one net from→to.
 * Events must be newest-first; we walk oldest→newest so `from` is the first
 * value and `to` is the last — reverses within the group cancel out.
 */
export function netFieldDiffs(
  eventsNewestFirst: OperationalTimelineEvent[],
): TimelineFieldDiff[] {
  const byLabel = new Map<string, { from: string; to: string }>();
  const chronological = [...eventsNewestFirst].reverse();

  for (const event of chronological) {
    for (const diff of event.diffs ?? []) {
      const existing = byLabel.get(diff.label);
      if (!existing) {
        byLabel.set(diff.label, { from: diff.from, to: diff.to });
      } else {
        existing.to = diff.to;
      }
    }
  }

  return [...byLabel.entries()]
    .map(([label, { from, to }]) => ({ label, from, to }))
    .filter((d) => d.from !== d.to);
}

function categoriesFromFields(fields: string[]): TimelineEventCategory[] {
  const cats = new Set<TimelineEventCategory>();
  for (const field of fields) {
    if (field === 'notes') cats.add('notes');
    if (field === 'driverId' || field === 'vehicleId') cats.add('assignment');
  }
  return [...cats];
}

function categoriesForKind(
  kind: TimelineEventKind,
  statusCode?: string,
): TimelineEventCategory[] {
  switch (kind) {
    case 'create':
    case 'assignment':
      return ['assignment'];
    case 'edit':
    case 'schedule':
      // Generic updates / schedule → All only (not Notes / Assignment).
      return [];
    case 'status':
    case 'undo':
    case 'cancel':
    case 'archive':
    case 'restore':
    case 'conflict': {
      const cats: TimelineEventCategory[] = ['status'];
      if (statusCode && GPS_STATUS.has(statusCode)) cats.push('gps');
      return cats;
    }
    case 'gps':
      return ['gps', 'status'];
    case 'document':
      return ['documents'];
    case 'note':
      return ['notes'];
    case 'invoice':
    case 'payment':
      return ['finance'];
    default:
      return [];
  }
}

function statusTitle(from: unknown, to: unknown, viaDriver = false): string {
  const toCode = typeof to === 'string' ? to : '';
  if (viaDriver) {
    if (toCode === 'AT_PICKUP') return 'Driver arrived at pickup';
    if (toCode === 'IN_TRANSIT') return 'Cargo loaded · In transit';
    if (toCode === 'DELIVERED') return 'Delivered';
    if (toCode === 'EN_ROUTE_TO_PICKUP') return 'En route to pickup';
  }
  if (toCode === 'AT_PICKUP') return 'Arrived at pickup';
  if (toCode === 'IN_TRANSIT') return 'In transit';
  if (toCode === 'DELIVERED') return 'Delivered';
  if (toCode === 'CANCELLED') return 'Cancelled';
  if (toCode === 'EN_ROUTE_TO_PICKUP') return 'En route to pickup';
  if (toCode === 'ASSIGNED') return 'Assigned';
  if (toCode === 'DRAFT') return 'Draft';
  if (from && to) return 'Status changed';
  return formatStatus(to);
}

function ensureUniqueIds(events: OperationalTimelineEvent[]): OperationalTimelineEvent[] {
  const seen = new Map<string, number>();
  return events.map((event) => {
    const count = seen.get(event.id) ?? 0;
    seen.set(event.id, count + 1);
    if (count === 0) return event;
    return { ...event, id: `${event.id}__${count}` };
  });
}

function auditDispatchEntry(
  entry: AuditLogEntry,
  ctx: BuildDispatchTimelineContext,
): OperationalTimelineEvent[] {
  const actor = actorLabel(entry);
  const meta = entry.metadata ?? {};

  switch (entry.action) {
    case 'dispatch.create':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Dispatch created',
          subtitle: typeof meta.dispatchNumber === 'string' ? meta.dispatchNumber : null,
          actor,
          kind: 'create',
          categories: categoriesForKind('create'),
          sequence: STATUS_SEQUENCE.DRAFT,
          searchText: buildSearchText(['dispatch created', meta.dispatchNumber, actor]),
        },
      ];

    case 'dispatch.reassign': {
      const from = meta.from as { driverId?: string; vehicleId?: string } | undefined;
      const to = meta.to as { driverId?: string; vehicleId?: string } | undefined;
      const diffs: TimelineFieldDiff[] = [];
      if (from?.driverId !== to?.driverId) {
        diffs.push({
          label: 'Driver',
          from: resolveEntityName('driverId', from?.driverId, ctx),
          to: resolveEntityName('driverId', to?.driverId, ctx),
        });
      }
      if (from?.vehicleId !== to?.vehicleId) {
        diffs.push({
          label: 'Vehicle',
          from: resolveEntityName('vehicleId', from?.vehicleId, ctx),
          to: resolveEntityName('vehicleId', to?.vehicleId, ctx),
        });
      }
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title:
            diffs.length === 1 && diffs[0]?.label === 'Driver'
              ? 'Driver assigned'
              : 'Crew reassigned',
          actor,
          kind: 'assignment',
          categories: categoriesForKind('assignment'),
          diffs: diffs.length > 0 ? diffs : undefined,
          searchText: buildSearchText([
            'reassign',
            'driver',
            'vehicle',
            actor,
            ...diffs.flatMap((d) => [d.from, d.to]),
          ]),
        },
      ];
    }

    case 'dispatch.update': {
      const changes = meta.changes as Record<string, unknown> | undefined;
      const rawChanges =
        changes && typeof changes === 'object' && !Array.isArray(changes)
          ? changes
          : {};

      const fields = Object.keys(rawChanges).filter((k) => rawChanges[k] !== undefined);
      if (fields.length === 0) {
        return [
          {
            id: entry.id,
            at: entry.createdAt,
            title: 'Dispatch updated',
            actor,
            kind: 'edit',
            categories: categoriesForKind('edit'),
            searchText: buildSearchText(['dispatch updated', actor]),
          },
        ];
      }

      const diffs: TimelineFieldDiff[] = [];
      const fieldLabels: string[] = [];

      for (const field of fields) {
        const label = DISPATCH_FIELD_LABELS[field] ?? field;
        fieldLabels.push(label);
        const value = rawChanges[field];
        if (field === 'driverId' || field === 'vehicleId') {
          diffs.push({
            label,
            from: '—',
            to: resolveEntityName(field, value, ctx),
          });
        } else {
          diffs.push({
            label,
            from: '—',
            to: formatValue(value),
          });
        }
      }

      const hasAssignment = fields.some((f) => f === 'driverId' || f === 'vehicleId');
      const hasNotesOnly = fields.length === 1 && fields[0] === 'notes';
      const cats = categoriesFromFields(fields);

      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: hasNotesOnly ? 'Notes updated' : 'Dispatch updated',
          actor,
          kind: hasNotesOnly ? 'note' : hasAssignment ? 'assignment' : 'edit',
          categories: cats,
          diffs,
          fieldLabels,
          detail: hasNotesOnly && typeof rawChanges.notes === 'string' ? rawChanges.notes : null,
          searchText: buildSearchText(['dispatch updated', ...fieldLabels, actor]),
        },
      ];
    }

    case 'dispatch.status_change':
    case 'dispatch.driver_status_change': {
      const viaDriver = entry.action === 'dispatch.driver_status_change';
      const toCode = typeof meta.to === 'string' ? meta.to : undefined;
      const title = statusTitle(meta.from, meta.to, viaDriver);
      // Dispatcher status_change always uses `status` kind so icons stay consistent.
      // Driver location updates keep `gps` kind for the MapPin treatment.
      const kind: TimelineEventKind =
        viaDriver && toCode && GPS_STATUS.has(toCode) ? 'gps' : 'status';
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title,
          actor,
          kind,
          categories: categoriesForKind('status', toCode),
          sequence: toCode ? STATUS_SEQUENCE[toCode] : undefined,
          diffs:
            meta.from && meta.to
              ? [
                  {
                    label: 'Status',
                    from: formatStatus(meta.from),
                    to: formatStatus(meta.to),
                  },
                ]
              : undefined,
          detail: typeof meta.note === 'string' ? meta.note : null,
          searchText: buildSearchText([
            title,
            String(meta.from ?? ''),
            String(meta.to ?? ''),
            typeof meta.note === 'string' ? meta.note : null,
            actor,
          ]),
        },
      ];
    }

    case 'dispatch.schedule_changed': {
      const from = meta.from as Record<string, string> | undefined;
      const to = meta.to as Record<string, string> | undefined;
      const diffs: TimelineFieldDiff[] = [];
      if (from?.pickupDateScheduled !== to?.pickupDateScheduled) {
        diffs.push({
          label: 'Pickup',
          from: formatDateTime(from?.pickupDateScheduled),
          to: formatDateTime(to?.pickupDateScheduled),
        });
      }
      if (from?.deliveryDateScheduled !== to?.deliveryDateScheduled) {
        diffs.push({
          label: 'Delivery',
          from: formatDateTime(from?.deliveryDateScheduled),
          to: formatDateTime(to?.deliveryDateScheduled),
        });
      }
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Schedule changed',
          actor,
          kind: 'schedule',
          categories: categoriesForKind('schedule'),
          diffs: diffs.length > 0 ? diffs : undefined,
          fieldLabels: diffs.map((d) => d.label),
          searchText: buildSearchText(['schedule', 'pickup', 'delivery', actor]),
        },
      ];
    }

    case 'dispatch.status_undo':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Status undone',
          actor,
          kind: 'undo',
          categories: categoriesForKind('undo'),
          sequence: typeof meta.to === 'string' ? STATUS_SEQUENCE[meta.to] : undefined,
          diffs:
            meta.from && meta.to
              ? [
                  {
                    label: 'Status',
                    from: formatStatus(meta.from),
                    to: formatStatus(meta.to),
                  },
                ]
              : undefined,
          searchText: buildSearchText([
            'undo',
            String(meta.from ?? ''),
            String(meta.to ?? ''),
            actor,
          ]),
        },
      ];

    case 'dispatch.cancel':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Dispatch cancelled',
          actor,
          kind: 'cancel',
          categories: categoriesForKind('cancel'),
          sequence: STATUS_SEQUENCE.CANCELLED,
          detail:
            typeof meta.previousStatus === 'string'
              ? `Was ${formatStatus(meta.previousStatus)}`
              : null,
          searchText: buildSearchText([
            'cancel',
            typeof meta.previousStatus === 'string' ? meta.previousStatus : null,
            actor,
          ]),
        },
      ];

    default:
      return [];
  }
}

function auditOrderEntry(entry: AuditLogEntry): OperationalTimelineEvent[] {
  const actor = actorLabel(entry);
  const meta = entry.metadata ?? {};

  switch (entry.action) {
    case 'order.document.upload':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Document uploaded',
          subtitle: typeof meta.fileName === 'string' ? meta.fileName : null,
          actor,
          kind: 'document',
          categories: categoriesForKind('document'),
          detail: typeof meta.documentType === 'string' ? meta.documentType : 'POD',
          searchText: buildSearchText([
            'document',
            'upload',
            'pod',
            typeof meta.fileName === 'string' ? meta.fileName : null,
            actor,
          ]),
        },
      ];
    case 'order.document.delete':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Document removed',
          subtitle: typeof meta.fileName === 'string' ? meta.fileName : null,
          actor,
          kind: 'document',
          categories: categoriesForKind('document'),
          searchText: buildSearchText([
            'document',
            'removed',
            typeof meta.fileName === 'string' ? meta.fileName : null,
            actor,
          ]),
        },
      ];
    case 'order.document.rename':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Document renamed',
          actor,
          kind: 'document',
          categories: categoriesForKind('document'),
          diffs:
            meta.from && meta.to
              ? [{ label: 'Name', from: String(meta.from), to: String(meta.to) }]
              : undefined,
          searchText: buildSearchText([
            'document',
            'rename',
            String(meta.from ?? ''),
            String(meta.to ?? ''),
            actor,
          ]),
        },
      ];
    case 'order.note.create':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Internal note added',
          actor,
          kind: 'note',
          categories: categoriesForKind('note'),
          detail: typeof meta.note === 'string' ? meta.note : null,
          searchText: buildSearchText([
            'note',
            typeof meta.note === 'string' ? meta.note : null,
            actor,
          ]),
        },
      ];
    case 'order.note.update':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Internal note updated',
          actor,
          kind: 'note',
          categories: categoriesForKind('note'),
          detail: typeof meta.note === 'string' ? meta.note : null,
          searchText: buildSearchText([
            'note',
            typeof meta.note === 'string' ? meta.note : null,
            actor,
          ]),
        },
      ];
    case 'order.note.delete':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Internal note removed',
          actor,
          kind: 'note',
          categories: categoriesForKind('note'),
          searchText: buildSearchText(['note', 'removed', actor]),
        },
      ];
    case 'order.archive':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Archived',
          actor,
          kind: 'archive',
          categories: categoriesForKind('archive'),
          searchText: buildSearchText(['archive', actor]),
        },
      ];
    case 'order.restore':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Restored',
          actor,
          kind: 'restore',
          categories: categoriesForKind('restore'),
          searchText: buildSearchText(['restore', actor]),
        },
      ];
    case 'order.status_change':
      return [];
    default:
      return [];
  }
}

function auditInvoiceEntry(entry: AuditLogEntry): OperationalTimelineEvent[] {
  const actor = actorLabel(entry);
  const meta = entry.metadata ?? {};

  switch (entry.action) {
    case 'invoice.create':
    case 'invoice.create_from_order':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Invoice generated',
          subtitle: typeof meta.invoiceNumber === 'string' ? meta.invoiceNumber : null,
          actor,
          kind: 'invoice',
          categories: categoriesForKind('invoice'),
          searchText: buildSearchText([
            'invoice',
            'generated',
            typeof meta.invoiceNumber === 'string' ? meta.invoiceNumber : null,
            actor,
          ]),
        },
      ];
    case 'invoice.send':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Invoice sent',
          subtitle: typeof meta.invoiceNumber === 'string' ? meta.invoiceNumber : null,
          actor,
          kind: 'invoice',
          categories: categoriesForKind('invoice'),
          searchText: buildSearchText([
            'invoice',
            'sent',
            typeof meta.invoiceNumber === 'string' ? meta.invoiceNumber : null,
            actor,
          ]),
        },
      ];
    case 'invoice.cancel':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Invoice cancelled',
          actor,
          kind: 'invoice',
          categories: categoriesForKind('invoice'),
          searchText: buildSearchText(['invoice', 'cancel', actor]),
        },
      ];
    case 'payment.record':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title:
            meta.resultingInvoiceStatus === 'PAID' ? 'Invoice paid' : 'Payment recorded',
          actor,
          kind: 'payment',
          categories: categoriesForKind('payment'),
          detail: meta.amount != null ? formatMoney(String(meta.amount)) : null,
          searchText: buildSearchText([
            'payment',
            'invoice paid',
            meta.amount != null ? String(meta.amount) : null,
            actor,
          ]),
        },
      ];
    default:
      return [];
  }
}

function statusHistoryFallback(ctx: BuildDispatchTimelineContext): OperationalTimelineEvent[] {
  // Prefer audit status events when present — mixing both causes interleaved
  // / out-of-order status rows (Draft after En Route, duplicate keys, etc.).
  const hasStatusAudit = ctx.dispatchAuditLogs.some(
    (e) =>
      e.action === 'dispatch.status_change' ||
      e.action === 'dispatch.driver_status_change' ||
      e.action === 'dispatch.status_undo',
  );
  if (hasStatusAudit) return [];

  return (ctx.dispatch.statusHistory ?? []).map((row, index) => ({
    id: `sh-${row.id || `${row.status}-${row.createdAt}-${index}`}`,
    at: row.createdAt,
    title: statusLabel(row.status),
    actor: null,
    kind: 'status' as const,
    categories: categoriesForKind('status', row.status),
    sequence: STATUS_SEQUENCE[row.status] ?? index,
    detail: row.note,
    searchText: buildSearchText([row.status, row.note, statusLabel(row.status)]),
  }));
}

/** Only group same-kind bursts — never notes with assignment, etc. */
function isGroupableKind(kind: TimelineEventKind): boolean {
  return kind === 'edit' || kind === 'schedule' || kind === 'assignment';
}

function groupEditEvents(
  events: OperationalTimelineEvent[],
  windowMs: number,
): OperationalTimelineEvent[] {
  if (events.length === 0) return events;

  const sorted = sortTimelineEventsDesc(events);
  const result: OperationalTimelineEvent[] = [];
  let buffer: OperationalTimelineEvent[] = [];

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    if (buffer.length === 1) {
      result.push(buffer[0]!);
      buffer = [];
      return;
    }

    const first = buffer[0]!;
    const fieldLabels = [
      ...new Set(buffer.flatMap((e) => e.fieldLabels ?? e.diffs?.map((d) => d.label) ?? [])),
    ];
    const diffs = netFieldDiffs(buffer);
    const categories = [
      ...new Set(buffer.flatMap((e) => e.categories)),
    ] as TimelineEventCategory[];

    // Stable unique group id from member ids (sorted so order doesn't matter).
    const memberIds = [...buffer.map((e) => e.id)].sort();
    result.push({
      id: `group-${memberIds.join('__')}`,
      at: first.at,
      title: first.kind === 'schedule' ? 'Schedule changed' : 'Dispatch updated',
      actor: first.actor,
      kind: first.kind === 'schedule' ? 'schedule' : first.kind === 'assignment' ? 'assignment' : 'edit',
      categories,
      diffs: diffs.length > 0 ? diffs : undefined,
      fieldLabels: fieldLabels.length > 0 ? fieldLabels : undefined,
      subtitle:
        fieldLabels.length > 0
          ? fieldLabels.length <= 4
            ? fieldLabels.join(' · ')
            : `${fieldLabels.length} fields changed`
          : `${buffer.length} updates`,
      groupedCount: buffer.length,
      sequence: first.sequence,
      searchText: buildSearchText([
        'dispatch updated',
        ...fieldLabels,
        ...buffer.map((e) => e.searchText),
      ]),
    });
    buffer = [];
  };

  for (const event of sorted) {
    if (!isGroupableKind(event.kind)) {
      flushBuffer();
      result.push(event);
      continue;
    }

    const prev = buffer[0];
    if (
      prev &&
      prev.kind === event.kind &&
      prev.actor === event.actor &&
      Math.abs(eventTimeMs(prev.at) - eventTimeMs(event.at)) <= windowMs
    ) {
      buffer.push(event);
    } else {
      flushBuffer();
      buffer = [event];
    }
  }
  flushBuffer();

  return sortTimelineEventsDesc(result);
}

export function buildDispatchOperationalTimeline(
  ctx: BuildDispatchTimelineContext,
): OperationalTimelineEvent[] {
  try {
    return buildDispatchOperationalTimelineUnsafe(ctx);
  } catch (err) {
    console.error('Failed to build dispatch operational timeline', err);
    return [];
  }
}

function buildDispatchOperationalTimelineUnsafe(
  ctx: BuildDispatchTimelineContext,
): OperationalTimelineEvent[] {
  const windowMs = ctx.groupWindowMs ?? 60_000;

  const fromDispatch = ctx.dispatchAuditLogs.flatMap((e) => auditDispatchEntry(e, ctx));
  const fromOrder = (ctx.orderAuditLogs ?? []).flatMap((e) => auditOrderEntry(e));
  const fromInvoice = (ctx.invoiceAuditLogs ?? []).flatMap((e) => auditInvoiceEntry(e));
  const fromHistory = statusHistoryFallback(ctx);

  const items = [...fromDispatch, ...fromOrder, ...fromInvoice, ...fromHistory];

  if (ctx.invoice) {
    const hasInvoiceEvent = items.some((e) => e.kind === 'invoice');
    if (!hasInvoiceEvent) {
      items.push({
        id: `invoice-fallback-${ctx.invoice.id}`,
        at: ctx.invoice.createdAt,
        title: 'Invoice generated',
        subtitle: ctx.invoice.invoiceNumber,
        actor: null,
        kind: 'invoice',
        categories: categoriesForKind('invoice'),
        searchText: buildSearchText(['invoice', ctx.invoice.invoiceNumber]),
      });
    }
  }

  const seen = new Set<string>();
  const deduped = items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return ensureUniqueIds(groupEditEvents(deduped, windowMs));
}

export function filterTimelineEvents(
  events: OperationalTimelineEvent[],
  category: TimelineFilterCategory,
  searchQuery: string,
): OperationalTimelineEvent[] {
  const q = searchQuery.trim().toLowerCase();
  return events.filter((event) => {
    if (category !== 'all' && !event.categories.includes(category)) return false;
    if (q && !event.searchText.includes(q)) return false;
    return true;
  });
}

export function parseTimelineFilter(value: unknown): TimelineFilterCategory {
  const allowed = new Set(TIMELINE_FILTER_OPTIONS.map((o) => o.id));
  if (typeof value === 'string' && allowed.has(value as TimelineFilterCategory)) {
    return value as TimelineFilterCategory;
  }
  return 'all';
}

export const TIMELINE_FILTER_OPTIONS: { id: TimelineFilterCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'status', label: 'Status' },
  { id: 'documents', label: 'Documents' },
  { id: 'notes', label: 'Notes' },
  { id: 'finance', label: 'Finance' },
  { id: 'gps', label: 'GPS' },
  { id: 'assignment', label: 'Assignment' },
];
