export interface TriggerDefinition {
  type: string;
  displayName: string;
  description: string;
}

/// Only events that domain services actually emit via WorkflowEventService.
/// Marketing-style aliases (order.delivered, dispatch.assigned, invoice.overdue,
/// lead.created, …) were removed so the editor cannot configure workflows that
/// never fire. Use conditions on status_changed / completed events instead.
export const TRIGGER_DEFINITIONS: TriggerDefinition[] = [
  { type: 'manual', displayName: 'Manual Trigger', description: 'Triggered manually by a user' },
  // 'webhook' and 'schedule' were removed: nothing in the product (UI or API)
  // can create a WorkflowWebhook or WorkflowSchedule row, so a workflow built
  // on either trigger could never fire — the exact case the comment above
  // this array warns about. The receiving/firing infrastructure for both
  // (WorkflowsWebhookController, WorkflowSchedulerService) is still intact for
  // when a provisioning UI/API is built; only the dead menu entries are gone.
  { type: 'order.created', displayName: 'Order Created', description: 'When a new order is placed' },
  { type: 'order.updated', displayName: 'Order Updated', description: 'When an order is modified' },
  { type: 'order.status_changed', displayName: 'Order Status Changed', description: 'When staff change an order\'s status directly via the Orders screen (filter on payload.to). Does NOT fire for the normal Dispatch Board flow (assign/pickup/deliver) — use dispatch.status_changed / dispatch.completed for that.' },
  { type: 'order.cancelled', displayName: 'Order Cancelled', description: 'When an order is cancelled' },
  { type: 'dispatch.created', displayName: 'Dispatch Created', description: 'When a dispatch is created (includes initial driver/vehicle assignment)' },
  { type: 'dispatch.status_changed', displayName: 'Dispatch Status Changed', description: 'When a dispatch status changes' },
  { type: 'dispatch.completed', displayName: 'Dispatch Completed', description: 'When a dispatch reaches a completed terminal status' },
  { type: 'invoice.created', displayName: 'Invoice Created', description: 'When a new invoice is generated' },
  { type: 'invoice.paid', displayName: 'Invoice Paid', description: 'When an invoice is paid in full' },
  { type: 'payment.received', displayName: 'Payment Received', description: 'When a payment is recorded' },
  { type: 'customer.created', displayName: 'Customer Created', description: 'When a new customer is added' },
  { type: 'customer.updated', displayName: 'Customer Updated', description: 'When a customer record changes' },
  { type: 'driver.created', displayName: 'Driver Created', description: 'When a new driver is registered' },
  { type: 'vehicle.created', displayName: 'Vehicle Created', description: 'When a new vehicle is added' },
  { type: 'expense.created', displayName: 'Expense Created', description: 'When an expense is submitted' },
  { type: 'expense.approved', displayName: 'Expense Approved', description: 'When an expense is approved' },
  { type: 'trip.started', displayName: 'Trip Started', description: 'When a vehicle starts a tracked journey' },
  { type: 'trip.completed', displayName: 'Trip Completed', description: 'When a tracked journey ends' },
  { type: 'vehicle.geofence.entered', displayName: 'Geofence Entered', description: 'When a vehicle enters a geofence' },
  { type: 'vehicle.geofence.exited', displayName: 'Geofence Exited', description: 'When a vehicle leaves a geofence' },
  { type: 'telematics.alert.raised', displayName: 'Telematics Alert', description: 'When a fleet alert fires (speeding, idle, offline, harsh driving, geofence, low fuel, check-engine)' },
];

export const TRIGGER_TYPES = TRIGGER_DEFINITIONS.map((t) => t.type);
