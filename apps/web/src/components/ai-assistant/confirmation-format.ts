import { formatMoney } from '@/lib/format';

export interface ConfirmationField {
  label: string;
  value: string;
}

export interface ConfirmationSummary {
  /// e.g. "Create Customer" — what a human would call this action.
  title: string;
  /// The record's own name, when the arguments contain one — shown as the
  /// card's subtitle so "which one?" is answered before "what fields?".
  entity?: string;
  fields: ConfirmationField[];
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function shortId(v: unknown): string {
  const s = str(v);
  return s.length > 10 ? `${s.slice(0, 8)}…` : s;
}

function humanizeToolName(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function humanizeTriggerEvent(event: string): string {
  const [entity, action] = event.split('.');
  if (!action) return event;
  return `When a ${entity} is ${action.replace(/_/g, ' ')}`;
}

/// Per-tool formatters for the mutating tools that exist today (see
/// apps/api/src/ai/tools/write.tools.ts and notification.tools.ts). Anything
/// not listed here — including any future mutating tool — still gets a
/// readable card via the generic fallback below; it just lists its raw
/// arguments instead of curated field labels.
const FORMATTERS: Record<string, (args: Record<string, unknown>) => ConfirmationSummary> = {
  create_customer: (a) => ({
    title: 'Create Customer',
    entity: str(a.companyName) || undefined,
    fields: [
      { label: 'Company', value: str(a.companyName) },
      { label: 'Contact', value: str(a.contactName) },
      ...(a.email ? [{ label: 'Email', value: str(a.email) }] : []),
      ...(a.phone ? [{ label: 'Phone', value: str(a.phone) }] : []),
      ...(a.city || a.country
        ? [{ label: 'Location', value: [a.city, a.country].filter(Boolean).map(str).join(', ') }]
        : []),
    ],
  }),
  create_order: (a) => ({
    title: 'Create Order',
    entity: str(a.customerId) ? `Customer ${shortId(a.customerId)}` : undefined,
    fields: [
      { label: 'Pickup', value: `${str(a.pickupCity)} — ${str(a.pickupDate)}` },
      { label: 'Delivery', value: `${str(a.deliveryCity)} — ${str(a.deliveryDate)}` },
      { label: 'Cargo', value: str(a.cargoDescription) },
      ...(typeof a.price === 'number' || typeof a.price === 'string'
        ? [{ label: 'Price', value: formatMoney(a.price as number | string, str(a.currency) || undefined) }]
        : []),
    ],
  }),
  assign_driver: (a) => ({
    title: 'Assign Driver',
    fields: [
      { label: 'Order', value: shortId(a.orderId) },
      { label: 'Driver', value: shortId(a.driverId) },
      ...(a.vehicleId ? [{ label: 'Vehicle', value: shortId(a.vehicleId) }] : []),
    ],
  }),
  create_workflow: (a) => ({
    title: 'Create Workflow',
    entity: str(a.name) || undefined,
    fields: [
      { label: 'Name', value: str(a.name) },
      { label: 'Trigger', value: humanizeTriggerEvent(str(a.triggerEvent)) },
      {
        label: 'Actions',
        value: Array.isArray(a.actions) ? `${a.actions.length} step${a.actions.length === 1 ? '' : 's'}` : '0 steps',
      },
      { label: 'Status', value: 'Created as draft — not active until published' },
    ],
  }),
  create_notification: (a) => ({
    title: 'Send Notification',
    entity: str(a.title) || undefined,
    fields: [
      { label: 'Title', value: str(a.title) },
      { label: 'Message', value: str(a.message) },
      ...(a.category ? [{ label: 'Category', value: str(a.category) }] : []),
    ],
  }),
  mark_notification_read: (a) => ({
    title: 'Mark Notification Read',
    fields: [{ label: 'Notification', value: shortId(a.id) }],
  }),
};

/// Turns a raw {tool, arguments} confirmation call into what the card shows.
/// `toolDescription` (from AiCapabilities.tools) is the fallback title
/// source for any tool without a curated formatter above.
export function summarizeConfirmation(
  call: { tool: string; arguments: Record<string, unknown> },
  toolDescription?: string,
): ConfirmationSummary {
  const formatter = FORMATTERS[call.tool];
  if (formatter) return formatter(call.arguments ?? {});

  const fields = Object.entries(call.arguments ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([key, value]) => ({
      label: key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()),
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
    }));

  return {
    title: humanizeToolName(call.tool),
    fields: fields.length > 0 ? fields : [{ label: 'Details', value: toolDescription ?? 'No parameters.' }],
  };
}
