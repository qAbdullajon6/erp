export interface ActionDefinition {
  type: string;
  displayName: string;
  description: string;
}

export const ACTION_DEFINITIONS: ActionDefinition[] = [
  { type: 'send_email', displayName: 'Send Email', description: 'Send an email to a specified address' },
  { type: 'send_notification', displayName: 'Send Notification', description: 'Create an in-app notification' },
  { type: 'send_sms', displayName: 'Send SMS', description: 'Send an SMS text message' },
  { type: 'webhook', displayName: 'HTTP Request', description: 'Make an HTTP request to an external URL' },
  { type: 'create_entity', displayName: 'Create Record', description: 'Create a new record in the system' },
  { type: 'update_entity', displayName: 'Update Record', description: 'Update an existing record' },
  { type: 'delete_entity', displayName: 'Delete Record', description: 'Delete a record from the system' },
  { type: 'change_status', displayName: 'Change Status', description: 'Update the status of an entity' },
  { type: 'assign_driver', displayName: 'Assign Driver', description: 'Assign a driver to a dispatch' },
  { type: 'create_invoice', displayName: 'Create Invoice', description: 'Generate an invoice for an order' },
  { type: 'generate_report', displayName: 'Generate Report', description: 'Generate and deliver a report' },
  { type: 'flag_for_review', displayName: 'Flag for Review', description: 'Flag an item for manual review' },
  { type: 'delay', displayName: 'Delay', description: 'Wait for a specified duration before continuing' },
  { type: 'condition', displayName: 'Condition', description: 'Branch execution based on conditions' },
  { type: 'approval', displayName: 'Manual Approval', description: 'Pause execution until manually approved' },
  { type: 'set_variable', displayName: 'Set Variable', description: 'Set a workflow variable for later steps' },
  { type: 'log', displayName: 'Log Message', description: 'Write a message to the execution log' },
];

export const ACTION_TYPES = ACTION_DEFINITIONS.map((a) => a.type);
