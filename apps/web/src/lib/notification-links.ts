/// Maps a notification's `entityType` (from the backend's `Notification.entityType`
/// field) to a real, existing detail route. There is no `actionUrl` field on the
/// backend model — only `entityType`/`entityId` — so this list must stay in sync
/// with what routes actually exist. Invoice deep-links into Finance with a search
/// param that opens the invoice sheet.
export interface EntityLink {
  to: string;
  params: Record<string, string>;
  search?: Record<string, string>;
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
    case 'Dispatch':
      return { to: '/app/dispatches/$dispatchId', params: { dispatchId: entityId }, label: 'View Dispatch' };
    case 'Workflow':
      return { to: '/app/workflows/$workflowId', params: { workflowId: entityId }, label: 'View Workflow' };
    case 'Invoice':
      return {
        to: '/app/finance',
        params: {},
        search: { tab: 'invoices', invoiceId: entityId },
        label: 'View Invoice',
      };
    case 'SupportTicket':
      // Handled by the Support drawer via the `openSupportTicket` search param.
      // We point to the current shell route so the app stays in place.
      return {
        to: '/app',
        params: {},
        search: { openSupportTicket: entityId },
        label: 'View Support Ticket',
      };
    default:
      return null;
  }
}
