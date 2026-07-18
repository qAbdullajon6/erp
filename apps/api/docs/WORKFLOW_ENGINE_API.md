# Workflow Engine API

Production-ready workflow automation engine for FlowERP. Supports event-driven triggers, conditional logic, sequential/parallel actions, and persistent execution with crash recovery.

## Endpoints

### Workflows CRUD

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/workflows` | ADMIN, OPS_MGR, DISPATCHER, ACCOUNTANT, SALES | List workflows (paginated) |
| GET | `/workflows/:id` | (same read roles) | Get workflow by ID |
| POST | `/workflows` | ADMIN, OPS_MGR | Create workflow |
| PATCH | `/workflows/:id` | ADMIN, OPS_MGR | Update workflow |
| DELETE | `/workflows/:id` | ADMIN, OPS_MGR | Delete workflow |
| POST | `/workflows/:id/toggle` | ADMIN, OPS_MGR | Toggle active state |

### Lifecycle

| Method | Path | Description |
|--------|------|-------------|
| POST | `/workflows/:id/publish` | Publish (creates version snapshot, activates) |
| POST | `/workflows/:id/archive` | Archive (deactivates permanently) |
| POST | `/workflows/:id/duplicate` | Duplicate as new DRAFT |
| GET | `/workflows/:id/export` | Export config as JSON |
| POST | `/workflows/import` | Import from exported JSON |

### Execution

| Method | Path | Description |
|--------|------|-------------|
| POST | `/workflows/:id/execute` | Manual trigger |
| GET | `/workflows/:id/executions` | List executions (paginated) |
| GET | `/workflows/executions/:executionId` | Get execution detail with steps/logs |
| POST | `/workflows/executions/:executionId/cancel` | Cancel running execution |
| POST | `/workflows/executions/:executionId/retry` | Retry failed execution |

### Metadata

| Method | Path | Description |
|--------|------|-------------|
| GET | `/workflows/triggers` | List available trigger definitions |
| GET | `/workflows/actions` | List available action definitions |
| GET | `/workflows/templates` | List workflow templates |
| POST | `/workflows/from-template/:templateId` | Create from template |

### Webhook Trigger (no auth — uses secret)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhooks/workflows/:orgId/:path` | Trigger workflow via webhook |

Header: `x-webhook-secret: <secret>`

## Workflow Config Schema

```json
{
  "trigger": {
    "event": "order.created"
  },
  "conditions": {
    "operator": "AND",
    "conditions": [
      { "field": "payload.price", "operator": "greater_than", "value": 1000 }
    ]
  },
  "actions": [
    {
      "type": "send_notification",
      "config": {
        "title": "High-value order",
        "message": "Order {{payload.orderNumber}} worth {{payload.price}}"
      }
    }
  ]
}
```

## Trigger Events

| Event | Source | Payload |
|-------|--------|---------|
| `manual` | Manual execution | User-provided |
| `webhook` | External HTTP POST | Request body |
| `schedule` | Cron schedule | `{ scheduleId, cron }` |
| `order.created` | OrdersService.create | `{ id, orderNumber, customerId, status }` |
| `order.updated` | OrdersService.update | `{ id, orderNumber, changes }` |
| `order.status_changed` | OrdersService.updateStatus | `{ id, orderNumber, from, to }` |
| `order.cancelled` | OrdersService.cancel | `{ id, orderNumber, note }` |
| `dispatch.created` | DispatchesService.create | `{ id, dispatchNumber, orderId, driverId, vehicleId }` |
| `dispatch.status_changed` | DispatchesService.updateStatus | `{ id, dispatchNumber, from, to }` |
| `dispatch.completed` | DispatchesService.updateStatus (DELIVERED) | `{ id, dispatchNumber }` |
| `invoice.created` | InvoicesService.create/createFromOrder | `{ id, invoiceNumber, customerId, totalAmount }` |
| `invoice.paid` | PaymentsService.record (when fully paid) | `{ id, invoiceNumber }` |
| `payment.received` | PaymentsService.record | `{ id, invoiceId, amount }` |
| `customer.created` | CustomersService.create | `{ id, customerCode, companyName }` |
| `customer.updated` | CustomersService.update | `{ id, companyName, changes }` |
| `driver.created` | DriversService.create | `{ id, employeeCode, firstName, lastName }` |
| `vehicle.created` | VehiclesService.create | `{ id, vehicleCode, plateNumber }` |
| `expense.created` | ExpensesService.create | `{ id, expenseNumber, amount }` |
| `expense.approved` | ExpensesService.approve | `{ id, expenseNumber, amount }` |

## Action Types

| Type | Description | Config |
|------|-------------|--------|
| `send_email` | Send email | `{ to, subject, body }` |
| `send_notification` | Create in-app notification | `{ title, message }` |
| `webhook` | HTTP request to external URL | `{ url, method?, headers?, payload? }` |
| `change_status` | Update entity status | `{ entityType, entityId?, status }` |
| `assign_driver` | Assign driver to dispatch | `{ driverId, dispatchId? }` |
| `create_invoice` | Auto-create invoice from order | `{ orderId? }` |
| `update_entity` | Update entity fields | `{ entityType, entityId?, fields }` |
| `create_entity` | Create new entity | `{ entityType, fields }` |
| `flag_for_review` | Create high-priority notification | `{ reason }` |
| `set_variable` | Set execution variable | `{ name, value }` |
| `log` | Log message | `{ message }` |
| `generate_report` | Generate report (placeholder) | `{ reportType }` |
| `send_sms` | Send SMS (provider required) | `{ to, message }` |
| `delete_entity` | Delete entity (notifications only) | `{ entityType, entityId }` |

## Template Interpolation

Actions support `{{path}}` interpolation:

- `{{payload.field}}` — event payload field
- `{{variables.name}}` — execution variable
- `{{step.0.field}}` — result from step 0

## Condition Operators

`equals`, `not_equals`, `contains`, `greater_than`, `less_than`, `in`, `not_in`, `is_empty`, `is_not_empty`, `starts_with`, `ends_with`, `regex`

Groups: `AND` (all must match), `OR` (any must match). Nested groups supported.

## Execution Model

1. Workflow is triggered (manual, event, webhook, or schedule)
2. Conditions are evaluated against the event payload
3. If conditions pass, execution record is created with status `PENDING`
4. Engine runs asynchronously (`setImmediate`)
5. Each action executes sequentially; results stored per-step
6. On failure: step marked FAILED, execution marked FAILED, error logged
7. On success: execution marked COMPLETED with duration
8. Timeout: configurable per-workflow (default 5 minutes)
9. Cancellation: checked between steps; AbortController kills in-progress actions

## Security

- **Tenant isolation**: All queries filter by `organizationId`
- **RBAC**: Write operations require ADMIN or OPERATIONS_MANAGER role
- **Infinite loop protection**: MAX_LOOP_ITERATIONS = 100
- **Expression sandboxing**: No eval/Function — only safe field-path resolution
- **Webhook secrets**: SHA-256 with timing-safe comparison
- **Execution timeout**: AbortController-based with configurable limit
- **Idempotency**: Optional key prevents duplicate executions

## Database Models

- `Workflow` — Definition with config, status, version
- `WorkflowVersion` — Immutable snapshots on publish
- `WorkflowExecution` — Execution instances with status tracking
- `WorkflowExecutionStep` — Per-action step results
- `WorkflowLog` — Execution event log
- `WorkflowTemplate` — Reusable workflow templates
- `WorkflowSchedule` — Cron-based schedules
- `WorkflowWebhook` — Incoming webhook endpoints
