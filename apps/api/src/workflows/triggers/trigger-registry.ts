export interface TriggerDefinition {
  type: string;
  displayName: string;
  description: string;
}

export const TRIGGER_DEFINITIONS: TriggerDefinition[] = [
  { type: 'manual', displayName: 'Manual Trigger', description: 'Triggered manually by a user' },
  { type: 'webhook', displayName: 'Incoming Webhook', description: 'Triggered by an external HTTP request' },
  { type: 'schedule', displayName: 'Schedule (Cron)', description: 'Triggered on a recurring schedule' },
  { type: 'order.created', displayName: 'Order Created', description: 'When a new order is placed' },
  { type: 'order.updated', displayName: 'Order Updated', description: 'When an order is modified' },
  { type: 'order.delivered', displayName: 'Order Delivered', description: 'When an order is marked delivered' },
  { type: 'order.cancelled', displayName: 'Order Cancelled', description: 'When an order is cancelled' },
  { type: 'dispatch.assigned', displayName: 'Dispatch Assigned', description: 'When a dispatch is assigned to a driver' },
  { type: 'dispatch.delivered', displayName: 'Dispatch Delivered', description: 'When a dispatch delivery is completed' },
  { type: 'dispatch.status_changed', displayName: 'Dispatch Status Changed', description: 'When a dispatch status changes' },
  { type: 'invoice.created', displayName: 'Invoice Created', description: 'When a new invoice is generated' },
  { type: 'invoice.paid', displayName: 'Invoice Paid', description: 'When an invoice is paid in full' },
  { type: 'invoice.overdue', displayName: 'Invoice Overdue', description: 'When an invoice becomes overdue' },
  { type: 'payment.received', displayName: 'Payment Received', description: 'When a payment is recorded' },
  { type: 'customer.created', displayName: 'Customer Created', description: 'When a new customer is added' },
  { type: 'customer.updated', displayName: 'Customer Updated', description: 'When a customer record changes' },
  { type: 'driver.created', displayName: 'Driver Created', description: 'When a new driver is registered' },
  { type: 'vehicle.created', displayName: 'Vehicle Created', description: 'When a new vehicle is added' },
  { type: 'lead.created', displayName: 'Lead Created', description: 'When a new lead is captured' },
  { type: 'expense.created', displayName: 'Expense Created', description: 'When an expense is submitted' },
  { type: 'expense.approved', displayName: 'Expense Approved', description: 'When an expense is approved' },
  { type: 'api', displayName: 'API Trigger', description: 'Triggered programmatically via the Workflow API' },
];

export const TRIGGER_TYPES = TRIGGER_DEFINITIONS.map((t) => t.type);
