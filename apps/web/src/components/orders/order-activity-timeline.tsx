'use client';

import { useMemo } from 'react';
import type { Order, OrderStatus } from '@/lib/api/orders';
import type { AuditLogEntry } from '@/lib/api/audit-logs';
import type { Invoice } from '@/lib/api/invoices';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  FileText,
  Package,
  Route as RouteIcon,
  User,
  UserPlus,
} from 'lucide-react';

export type ActivityTimelineEntry = {
  id: string;
  at: string;
  title: string;
  detail?: string | null;
  actor?: string | null;
  kind: string;
};

const FIELD_LABELS: Record<string, string> = {
  customerId: 'Customer',
  pickupAddress: 'Pickup address',
  pickupCity: 'Pickup city',
  pickupDate: 'Pickup date',
  deliveryAddress: 'Delivery address',
  deliveryCity: 'Delivery city',
  deliveryDate: 'Delivery date',
  cargoDescription: 'Cargo',
  cargoWeightKg: 'Weight',
  cargoVolumeM3: 'Volume',
  price: 'Price',
  currency: 'Currency',
  notes: 'Notes',
  deliveryNotes: 'Delivery notes',
  driverId: 'Driver',
  vehicleId: 'Vehicle',
  orderNumber: 'Order number',
};

const FIELD_TITLES: Record<string, string> = {
  customerId: 'Customer changed',
  pickupAddress: 'Pickup address changed',
  pickupCity: 'Pickup city changed',
  pickupDate: 'Pickup date changed',
  deliveryAddress: 'Delivery address changed',
  deliveryCity: 'Delivery city changed',
  deliveryDate: 'Delivery date changed',
  cargoDescription: 'Cargo changed',
  cargoWeightKg: 'Weight changed',
  cargoVolumeM3: 'Volume changed',
  price: 'Price changed',
  currency: 'Currency changed',
  notes: 'Notes changed',
  deliveryNotes: 'Delivery notes changed',
  driverId: 'Driver assigned',
  vehicleId: 'Vehicle assigned',
  orderNumber: 'Order number changed',
};

function actorLabel(entry: AuditLogEntry): string | null {
  if (!entry.actor) return 'System';
  return `${entry.actor.firstName} ${entry.actor.lastName}`.trim();
}

function formatChangeValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[complex value]';
    }
  }
  return String(value);
}

function safeAtKey(at: unknown): string {
  if (typeof at === 'string') return at.slice(0, 19);
  if (at instanceof Date) return at.toISOString().slice(0, 19);
  if (at == null) return 'unknown';
  return String(at).slice(0, 19);
}

function expandUpdateEntry(entry: AuditLogEntry): ActivityTimelineEntry[] {
  const actor = actorLabel(entry);
  const changes = entry.metadata?.changes as Record<string, unknown> | undefined;

  if (changes && typeof changes === 'object' && !Array.isArray(changes)) {
    const fields = Object.keys(changes).filter((k) => changes[k] !== undefined);
    if (fields.length > 0) {
      return fields.map((field) => ({
        id: `${entry.id}:${field}`,
        at: typeof entry.createdAt === 'string' ? entry.createdAt : String(entry.createdAt ?? ''),
        title: FIELD_TITLES[field] ?? `${FIELD_LABELS[field] ?? field} changed`,
        detail: `→ ${formatChangeValue(changes[field])}`,
        actor,
        kind: field === 'driverId' || field === 'vehicleId' ? 'assignment' : 'update',
      }));
    }
  }

  return [
    {
      id: entry.id,
      at: typeof entry.createdAt === 'string' ? entry.createdAt : String(entry.createdAt ?? ''),
      title: 'Order updated',
      detail: null,
      actor,
      kind: 'update',
    },
  ];
}

function auditToTimeline(entry: AuditLogEntry): ActivityTimelineEntry[] {
  const actor = actorLabel(entry);
  const meta = entry.metadata;

  switch (entry.action) {
    case 'order.create':
    case 'order.create.duplicate_override':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: entry.action.includes('duplicate')
            ? 'Order created (duplicate override)'
            : 'Order created',
          detail: null,
          actor,
          kind: 'create',
        },
      ];
    case 'order.update':
      return expandUpdateEntry(entry);
    case 'order.assign':
      return [
        {
          id: `${entry.id}:driver`,
          at: entry.createdAt,
          title: 'Driver assigned',
          detail: meta?.driverId ? `Driver ${String(meta.driverId).slice(0, 8)}…` : null,
          actor,
          kind: 'assignment',
        },
        ...(meta?.vehicleId
          ? [
              {
                id: `${entry.id}:vehicle`,
                at: entry.createdAt,
                title: 'Vehicle assigned',
                detail: null,
                actor,
                kind: 'assignment',
              } satisfies ActivityTimelineEntry,
            ]
          : []),
      ];
    case 'order.reassign':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Driver reassigned',
          detail: null,
          actor,
          kind: 'assignment',
        },
      ];
    case 'order.status_change':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Status changed',
          detail:
            meta?.from && meta?.to
              ? `${String(meta.from).replace(/_/g, ' ')} → ${String(meta.to).replace(/_/g, ' ')}`
              : null,
          actor,
          kind: 'status',
        },
      ];
    case 'order.cancel':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Order cancelled',
          detail: typeof meta?.note === 'string' ? meta.note : null,
          actor,
          kind: 'cancel',
        },
      ];
    case 'order.archive':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Order archived',
          detail: null,
          actor,
          kind: 'archive',
        },
      ];
    case 'order.restore':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Order restored',
          detail: null,
          actor,
          kind: 'restore',
        },
      ];
    case 'order.document.upload':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Document uploaded',
          detail: typeof meta?.fileName === 'string' ? meta.fileName : null,
          actor,
          kind: 'document',
        },
      ];
    case 'order.document.delete':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Document removed',
          detail: typeof meta?.fileName === 'string' ? meta.fileName : null,
          actor,
          kind: 'document',
        },
      ];
    case 'order.document.rename':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Document renamed',
          detail:
            meta?.from && meta?.to ? `${String(meta.from)} → ${String(meta.to)}` : null,
          actor,
          kind: 'document',
        },
      ];
    case 'order.note.create':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Internal note added',
          detail: typeof meta?.note === 'string' ? meta.note : null,
          actor,
          kind: 'note',
        },
      ];
    case 'order.note.update':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Internal note updated',
          detail: typeof meta?.note === 'string' ? meta.note : null,
          actor,
          kind: 'note',
        },
      ];
    case 'order.note.delete':
      return [
        {
          id: entry.id,
          at: entry.createdAt,
          title: 'Internal note removed',
          detail: null,
          actor,
          kind: 'note',
        },
      ];
    default:
      return [];
  }
}

function statusHistoryToTimeline(
  order: Order,
  highlightStatus?: OrderStatus | null,
  skipStatuses?: Set<string>,
): ActivityTimelineEntry[] {
  return (order.statusHistory ?? [])
    .filter((e) => !skipStatuses?.has(e.status))
    .map((e, index) => ({
      id: `sh-${e.id || `${e.status}-${e.createdAt}-${index}`}`,
      at: e.createdAt,
      title: e.status.replace(/_/g, ' '),
      detail: e.note,
      actor: null,
      kind: highlightStatus === e.status ? 'status-highlight' : 'status',
    }));
}

export function buildOrderActivityTimeline(
  order: Order,
  auditLogs: AuditLogEntry[],
  invoice?: Invoice | null,
): ActivityTimelineEntry[] {
  try {
    return buildOrderActivityTimelineUnsafe(order, auditLogs, invoice);
  } catch (err) {
    console.error('Failed to build order activity timeline', err);
    return [];
  }
}

function buildOrderActivityTimelineUnsafe(
  order: Order,
  auditLogs: AuditLogEntry[],
  invoice?: Invoice | null,
): ActivityTimelineEntry[] {
  const fromAudit = (Array.isArray(auditLogs) ? auditLogs : []).flatMap(auditToTimeline);

  // Prefer audit status_change entries over raw status history when both exist
  // for the same status transition at the same second.
  const auditStatusTimes = new Set(
    fromAudit
      .filter((e) => e.kind === 'status' || e.kind === 'create')
      .map((e) => `${e.title}-${safeAtKey(e.at)}`),
  );

  const fromStatus = statusHistoryToTimeline(order).filter((e) => {
    const key = `${e.title}-${safeAtKey(e.at)}`;
    return !auditStatusTimes.has(key) && !auditStatusTimes.has(`Order created-${safeAtKey(e.at)}`);
  });

  const items: ActivityTimelineEntry[] = [...fromAudit, ...fromStatus];

  if (invoice) {
    const already = fromAudit.some((e) => e.kind === 'invoice' || e.title === 'Invoice generated');
    if (!already) {
      items.push({
        id: `invoice-${invoice.id}`,
        at: invoice.createdAt,
        title: 'Invoice generated',
        detail: invoice.invoiceNumber,
        actor: null,
        kind: 'invoice',
      });
    }
  }

  if (order.deliveredAt && !fromAudit.some((e) => e.title === 'Delivered' || e.title === 'DELIVERED')) {
    items.push({
      id: `delivered-${order.id}`,
      at: order.deliveredAt,
      title: 'Delivered',
      detail: null,
      actor: null,
      kind: 'delivered',
    });
  }

  // Deduplicate by unique id (granular field events already have unique ids)
  const seen = new Set<string>();
  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}

const KIND_ICON: Record<string, typeof Package> = {
  create: Package,
  update: FileText,
  assignment: UserPlus,
  status: CheckCircle2,
  'status-highlight': CheckCircle2,
  cancel: Archive,
  archive: Archive,
  restore: ArchiveRestore,
  document: FileText,
  note: FileText,
  invoice: FileText,
  delivered: CheckCircle2,
};

interface OrderActivityTimelineProps {
  entries: ActivityTimelineEntry[];
  highlightStatus?: OrderStatus | null;
  className?: string;
}

export function OrderActivityTimeline({
  entries,
  highlightStatus,
  className,
}: OrderActivityTimelineProps) {
  const sorted = useMemo(() => entries, [entries]);

  if (sorted.length === 0) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        No activity recorded yet.
      </p>
    );
  }

  return (
    <ol className={cn('relative space-y-0', className)}>
      {sorted.map((entry, index) => {
        const Icon = KIND_ICON[entry.kind] ?? RouteIcon;
        const isLast = index === sorted.length - 1;
        const highlighted =
          highlightStatus &&
          entry.title.toUpperCase().replace(/ /g, '_') === highlightStatus;

        return (
          <li key={`${entry.id}-${index}`} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast ? (
              <span
                className="absolute left-[11px] top-6 h-[calc(100%-0.75rem)] w-px bg-border"
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                'relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                highlighted
                  ? 'bg-brand text-brand-foreground ring-2 ring-brand/30'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              <Icon className="h-3 w-3" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="text-sm font-medium text-foreground">{entry.title}</p>
                {entry.actor && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <User className="h-3 w-3" />
                    {entry.actor}
                  </span>
                )}
              </div>
              {entry.detail ? (
                <p className="mt-0.5 text-sm text-muted-foreground">{entry.detail}</p>
              ) : null}
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {formatDateTime(entry.at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
