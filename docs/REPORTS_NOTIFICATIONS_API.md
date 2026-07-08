# Reports and Notifications API

This document describes the Reports and Notifications modules, which provide real-time business intelligence and alerting in FlowERP AI's multi-tenant Connected Mode.

## Overview

**Reports** deliver read-only analytics across three domains:
- **Executive Overview**: Org-wide KPIs, trends, top performers
- **Operations**: Driver/vehicle/route performance and exceptions
- **Financial**: Receivables, collections, profitability by entity

**Notifications** generate rule-driven alerts when business conditions change (delayed orders, overdue invoices, expiry warnings, credit-limit risk, etc.), stored in the database with lifecycle management (create, read, archive, auto-resolve).

Both modules enforce strict multi-tenant isolation, role-based access, and organizational settings governance.

---

## Multi-Tenancy & Isolation

Every Reports and Notifications query is **organizationId-scoped** at the database level:
- Reports queries filter by `where: { organizationId }`
- Notifications row-level filtering by role: a given role only sees its category of notifications
- Settings are per-organization (stored in `NotificationSettings.organizationId`)
- No cross-org data leakage via any endpoint

---

## Authentication & Authorization

### Guards
All endpoints require:
1. **JwtAuthGuard**: Access token in `Authorization: Bearer <token>` header
2. **RolesGuard**: User role (extracted from JWT membership) must be in `@Roles(...)` list

### Role Matrix

| Role                   | Reports Access | Notifications Access | Settings Access |
|------------------------|--------------------|--------------------------|-----------------|
| ADMIN                  | ✓ All             | ✓ All                    | ✓ Edit org settings |
| OPERATIONS_MANAGER     | ✓ All             | ✓ Operations/Fleet only  | ✗ (read-only)   |
| DISPATCHER             | ✓ All             | ✓ Operations/Fleet only  | ✗ (read-only)   |
| ACCOUNTANT             | ✓ All             | ✓ Finance/Customers only | ✗ (read-only)   |
| SALES_CRM_MANAGER      | ✓ All             | ✓ Customers/Finance only | ✗ (read-only)   |
| DRIVER                 | ✗ Forbidden       | ✗ Forbidden              | ✗ Forbidden     |

---

## Reports API

### Shared Report Filter DTO

All report endpoints accept the same optional filter object (query parameters):

```typescript
{
  dateFrom?: string;              // ISO 8601 date string (e.g., "2026-01-01")
  dateTo?: string;                // ISO 8601 date string
  customerId?: string;            // UUID of customer
  driverId?: string;              // UUID of driver
  vehicleId?: string;             // UUID of vehicle
  pickupCity?: string;            // Case-insensitive exact match (not substring)
  deliveryCity?: string;          // Case-insensitive exact match
  orderStatus?: OrderStatus;      // Enum: DRAFT, PENDING, ASSIGNED, PICKED_UP, IN_TRANSIT, DELIVERED, CANCELLED
  invoiceStatus?: InvoiceStatus;  // Enum: DRAFT, SENT, PARTIALLY_PAID, PAID, OVERDUE, CANCELLED
  currency?: string;              // ISO 4217 3-letter code (e.g., "USD")
  timezone?: string;              // IANA timezone (e.g., "Asia/Tashkent"), defaults to org's timezone
  comparisonPeriod?: "previous_period" | "previous_year" | "none"  // Default: "none"
}
```

#### Date Range Resolution
- If `dateFrom` and `dateTo` are omitted, defaults to **last 30 days** (relative to today's date in the `timezone`).
- All dates are converted to UTC for querying but bucketed by the timezone's calendar (for time series).
- `comparisonPeriod` computes metrics for a second range:
  - `"previous_period"`: same duration, immediately preceding (e.g., if report range is days 10–20, comparison is days 0–9)
  - `"previous_year"`: same calendar month/day, one year prior
  - `"none"`: no comparison computed (comparison value is `null`)

#### Timezone Behavior
- `timezone` affects only time-series bucketing (day/month buckets for charts).
- All stored timestamps are UTC; the timezone only changes which calendar day/month a UTC instant belongs to for display.
- Invalid timezone strings fall back to UTC.

---

### GET `/reports/executive-overview`

**Roles**: ADMIN, OPERATIONS_MANAGER, DISPATCHER, ACCOUNTANT, SALES_CRM_MANAGER

Returns aggregated KPIs and trends.

#### Response

```typescript
{
  filters: ReportFilters;  // Echo of the request filters
  totals: {
    totalOrders: number;                      // All orders matching filter
    deliveredOrders: number;                  // status = "DELIVERED"
    activeOrders: number;                     // status in [PENDING, ASSIGNED, PICKED_UP, IN_TRANSIT]
    delayedOrders: number;                    // status ≠ DELIVERED, status ≠ CANCELLED, deliveryDate < now
    totalRevenue: string;                     // Sum of price for DELIVERED orders (decimal string)
    approvedExpenses: string;                 // Sum of amount for APPROVED expenses (decimal string)
    estimatedGrossProfit: string;             // totalRevenue - approvedExpenses (decimal string)
    totalInvoiced: string;                    // Sum of invoice totalAmount (not CANCELLED)
    totalCollected: string;                   // Sum of invoice paidAmount
    outstandingReceivables: string;           // Sum of invoice balanceDue (outstanding)
    deliveryCompletionRate: number;           // (deliveredOrders / totalOrders) * 100, or 0 if no orders
    onTimeDeliveryRate: number;               // (onTimeDeliveredCount / deliveredWithTimestamp) * 100, or 0
  },
  comparison?: {
    totalOrders: { current: number; previous: number; changePercent: number | null },
    deliveredOrders: { current: number; previous: number; changePercent: number | null },
    totalRevenue: { current: number; previous: number; changePercent: number | null },
    approvedExpenses: { current: number; previous: number; changePercent: number | null },
    estimatedGrossProfit: { current: number; previous: number; changePercent: number | null },
    totalInvoiced: { current: number; previous: number; changePercent: number | null },
    totalCollected: { current: number; previous: number; changePercent: number | null },
    deliveryCompletionRate: { current: number; previous: number; changePercent: number | null },
    onTimeDeliveryRate: { current: number; previous: number; changePercent: number | null },
  } | null;  // null if comparisonPeriod is "none"
  
  revenueVsExpensesTimeSeries: Array<{
    bucket: string;        // "2026-01-01" or "2026-01" depending on range granularity
    revenue: number;       // Revenue in this bucket
    expenses: number;      // Approved expenses in this bucket
  }>;
  
  deliveryPerformanceTimeSeries: Array<{
    bucket: string;
    delivered: number;     // DELIVERED orders in this bucket
    delayed: number;       // Delayed orders (see definition above) in this bucket
  }>;
  
  ordersByStatus: Array<{ status: string; count: number }>;
  
  topCustomers: Array<{
    customerId: string;
    companyName: string;
    revenue: string;       // Sum of price for DELIVERED orders from this customer
    orderCount: number;    // Count of DELIVERED orders
  }>;  // Top 5 by revenue
  
  topRoutes: Array<{
    pickupCity: string;
    deliveryCity: string;
    revenue: string;
    orderCount: number;
  }>;  // Top 5 by revenue
}
```

#### Calculations

**Delayed orders**: `status ≠ "DELIVERED" AND status ≠ "CANCELLED" AND deliveryDate < now`

**On-time delivery rate**: Only counts orders where `deliveredAt` is not null. `onTimeCount = count(deliveredAt <= deliveryDate)`. Rate = `(onTimeCount / deliveredWithTimestamp) * 100`.

**Estimated Gross Profit**: `totalRevenue - approvedExpenses`. Includes only expenses with `status = "APPROVED"`.

**Percentage Change**: `((current - previous) / abs(previous)) * 100` if previous ≠ 0; otherwise `null`.

---

### GET `/reports/operations`

**Roles**: ADMIN, OPERATIONS_MANAGER, DISPATCHER, ACCOUNTANT, SALES_CRM_MANAGER

Returns performance metrics by operational entity and exception lists.

#### Response

```typescript
{
  filters: ReportFilters;
  
  driverPerformance: Array<{
    driverId: string;
    employeeCode: string;
    name: string;                             // "FirstName LastName"
    totalOrders: number;                      // Orders assigned to this driver (any status)
    deliveredOrders: number;                  // DELIVERED
    onTimeRate: number;                       // (onTimeCount / deliveredOrders) * 100, or 0
    delayedOrders: number;                    // Active orders past their delivery date
    revenue: string;                          // Sum of DELIVERED order prices
  }>;  // Sorted by onTimeRate descending
  
  vehiclePerformance: Array<{
    vehicleId: string;
    vehicleCode: string;
    plateNumber: string;
    totalOrders: number;
    deliveredOrders: number;
    revenue: string;                          // Sum of DELIVERED order prices
    approvedExpenses: string;                 // Sum of APPROVED expenses for this vehicle
    estimatedGrossProfit: string;             // revenue - approvedExpenses
  }>;  // Sorted by estimatedGrossProfit descending
  
  routePerformance: Array<{
    pickupCity: string;
    deliveryCity: string;
    totalOrders: number;
    deliveredOrders: number;
    completionRate: number;                   // (deliveredOrders / totalOrders) * 100, or 0
    revenue: string;
  }>;  // Sorted by revenue descending
  
  exceptions: {
    delayedOrders: Array<OrderExceptionRow>;
    unassignedActiveOrders: Array<OrderExceptionRow>;  // status = "PENDING"
    cancelledOrders: Array<OrderExceptionRow>;         // status = "CANCELLED" (in date range only)
    negativeProfitOrders: Array<NegativeProfitRow>;    // DELIVERED orders where price < approvedExpenses
    deliveredWithoutInvoice: Array<OrderExceptionRow>; // DELIVERED but no invoice linked
  }
}

interface OrderExceptionRow {
  orderId: string;
  orderNumber: string;
  customerId: string;
  status: string;
  pickupCity: string;
  deliveryCity: string;
  deliveryDate: string;
  price: string;
  currency: string;
}

interface NegativeProfitRow extends OrderExceptionRow {
  approvedExpenses: string;
  estimatedGrossProfit: string;               // Negative
}
```

#### Exception Definitions

- **Delayed Orders**: `status ≠ "DELIVERED" AND status ≠ "CANCELLED" AND deliveryDate < now` (not date-range scoped; real-time)
- **Unassigned Active**: `status = "PENDING"` (not date-range scoped)
- **Cancelled**: `status = "CANCELLED"` (within date range only)
- **Negative-Profit Delivered**: DELIVERED orders where `price < sum(approvedExpenses)` for that order
- **Delivered Without Invoice**: DELIVERED orders with no linked invoice (within date range)

---

### GET `/reports/financial`

**Roles**: ADMIN, OPERATIONS_MANAGER, DISPATCHER, ACCOUNTANT, SALES_CRM_MANAGER

Returns receivables aging, collection performance, expense breakdown, and profitability analysis.

#### Response

```typescript
{
  filters: ReportFilters;
  
  receivablesAging: Array<{
    bucket: "current" | "1-30" | "31-60" | "61-90" | "90+";
    count: number;                            // Number of invoices in this bucket
    amount: string;                           // Sum of balanceDue in this bucket
  }>;
  
  invoiceCollectionPerformance: {
    totalInvoices: number;
    paidInvoices: number;                     // status = "PAID"
    overdueInvoices: number;                  // status = "OVERDUE"
    averageDaysToFullPayment: number;         // Avg days from issueDate to paidAt for PAID invoices
    collectionRate: number;                   // (totalCollected / totalInvoiced) * 100
  };
  
  expenseBreakdown: Array<{
    category: string;                         // ExpenseCategory enum value
    count: number;
    approvedAmount: string;                   // Sum for status = "APPROVED"
    pendingAmount: string;                    // Sum for status = "PENDING"
  }>;
  
  profitability: {
    label: string;                            // "Estimated Gross Profit"
    byCustomer: Array<{
      customerId: string;
      companyName: string;
      revenue: string;
      approvedExpenses: string;
      estimatedGrossProfit: string;
      orderCount: number;
    }>;
    byRoute: Array<{
      route: string;                          // "PickupCity -> DeliveryCity"
      revenue: string;
      approvedExpenses: string;
      estimatedGrossProfit: string;
      orderCount: number;
    }>;
    byDriver: Array<{
      driverId: string;
      name: string;
      revenue: string;
      approvedExpenses: string;
      estimatedGrossProfit: string;
      orderCount: number;
    }>;  // Only drivers with delivered orders in range
    byVehicle: Array<{
      vehicleId: string;
      plateNumber: string;
      revenue: string;
      approvedExpenses: string;
      estimatedGrossProfit: string;
      orderCount: number;
    }>;  // Only vehicles with delivered orders in range
    byOrder: Array<{
      orderId: string;
      orderNumber: string;
      currency: string;
      revenue: string;
      approvedExpenses: string;
      estimatedGrossProfit: string;
    }>;  // Sorted by estimatedGrossProfit ascending (negative first)
  };
}
```

#### Calculations

**Receivables Aging Buckets** (point-in-time, **not date-range filtered**):
- Invoices with `status ≠ "PAID" AND status ≠ "CANCELLED" AND balanceDue > 0`
- Days overdue = `(today - dueDate)` if dueDate has passed, else 0
- **current**: days ≤ 0 (not yet due or due today)
- **1-30**: 1–30 days overdue
- **31-60**: 31–60 days overdue
- **61-90**: 61–90 days overdue
- **90+**: > 90 days overdue

**Profitability**: DELIVERED orders within date range. Gross profit = `price - sum(approvedExpenses)`. Includes only expenses with `status = "APPROVED"`. Explicitly labelled "Estimated Gross Profit" (not accounting profit; no COGS, overhead, tax modeling).

**Average Days to Full Payment**: For PAID invoices, `avg(paidAt - issueDate)` in calendar days.

---

### GET `/reports/export`

**Roles**: ADMIN, OPERATIONS_MANAGER, DISPATCHER, ACCOUNTANT, SALES_CRM_MANAGER

Exports a report as CSV file.

#### Query Parameters

```
type=executive-overview|operations|financial   (required)
...all other ReportFilterDto params
```

#### Response

- **Content-Type**: `text/csv; charset=utf-8`
- **Content-Disposition**: `attachment; filename="<report-type>-report-<timestamp>.csv"`
- **Body**: Raw CSV, **not** JSON-wrapped

#### CSV Format

- RFC 4180 compliant
- Fields with commas, newlines, or quotes are quoted and internal quotes are doubled
- CRLF line endings
- UTF-8 encoding
- Header row contains column names matching the report type
- Example:
  ```csv
  orderId,orderNumber,customerId,revenue,approvedExpenses,estimatedGrossProfit
  550e8400-e29b-41d4-a716-446655440000,ORD-2026-0001,customer-id-123,"1000.00","150.00","850.00"
  ```

---

## Notifications API

### Notification Model

```typescript
{
  id: string;                                // UUID
  organizationId: string;                    // Multi-tenant scope
  type: string;                              // See rule table below
  category: "OPERATIONS" | "FINANCE" | "CUSTOMERS" | "FLEET";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;                             // Human-readable title
  message: string;                           // Human-readable message
  entityType: string | null;                 // e.g., "Order", "Invoice", "Driver"
  entityId: string | null;                   // UUID of the entity (e.g., orderId)
  isRead: boolean;                           // Default: false
  readAt: Date | null;                       // When marked read
  isArchived: boolean;                       // Default: false
  archivedAt: Date | null;                   // When archived or auto-resolved
  createdAt: Date;
  metadata: JSON | null;                     // Rule-specific metadata (e.g., orderNumber)
}
```

### Notification Categories & Rules

Notifications are **lazily generated on read** (not cron-based). When a client calls any notifications endpoint, the service runs `refresh(organizationId)`, which:

1. Fetches current settings (enabledCategories, thresholds)
2. Evaluates all 11 rules against the live database
3. **Creates** notifications for newly-qualifying entities
4. **Archives** (resolves) notifications for entities no longer qualifying
5. Returns the paginated notification list

#### Deduplication Strategy

The database enforces "at most one **open** (non-archived) notification per `(organizationId, type, entityId)`" via a partial unique index:

```sql
CREATE UNIQUE INDEX notifications_active_dedupe_unique
  ON notifications (organizationId, type, entityId)
  WHERE isArchived = false;
```

The service checks this before creating a new notification:
```typescript
const existing = await prisma.notification.findFirst({
  where: { organizationId, type, entityId, isArchived: false },
});
if (existing) return; // Already open, do not create duplicate
```

#### Rule Table

| Type                                  | Category   | Severity | Condition                                                | Entity Type | Auto-Resolves When |
|---------------------------------------|------------|----------|-----------------------------------------------------|-----------|----|
| `ORDER_DELAYED`                      | OPERATIONS | HIGH     | `status ≠ DELIVERED AND status ≠ CANCELLED AND deliveryDate < now` | Order    | Order reaches DELIVERED or CANCELLED |
| `ORDER_UNASSIGNED`                   | OPERATIONS | MEDIUM   | `status = PENDING`                                  | Order    | Order transitions away from PENDING |
| `INVOICE_OVERDUE`                    | FINANCE    | HIGH     | `status = OVERDUE` (computed lazily, not stored)   | Invoice  | Invoice status becomes PAID or CANCELLED |
| `INVOICE_DUE_SOON`                   | FINANCE    | LOW      | `dueDate <= now + settings.invoiceDueSoonDays AND status ≠ PAID AND status ≠ CANCELLED` | Invoice | Invoice becomes PAID or past dueDate |
| `CUSTOMER_CREDIT_LIMIT_EXCEEDED`     | CUSTOMERS  | CRITICAL | `outstandingInvoices > creditLimit`                | Customer | Invoices paid down below limit |
| `CUSTOMER_CREDIT_LIMIT_NEAR`         | CUSTOMERS  | MEDIUM   | `outstandingInvoices > (creditLimit * settings.creditLimitWarningPercent / 100)` | Customer | Invoices paid down below threshold |
| `ORDER_NEGATIVE_PROFIT`              | FINANCE    | HIGH     | `status = DELIVERED AND price < sum(approvedExpenses)` | Order    | Expenses reduced (unlikely in practice) or order cancelled |
| `VEHICLE_INSURANCE_EXPIRY`           | FLEET      | MEDIUM   | `insuranceExpiresAt <= now + settings.expiryWarningDays` | Vehicle  | Insurance date updated or vehicle archived |
| `VEHICLE_INSPECTION_EXPIRY`          | FLEET      | MEDIUM   | `inspectionExpiresAt <= now + settings.expiryWarningDays` | Vehicle  | Inspection date updated or vehicle archived |
| `DRIVER_LICENSE_EXPIRY`              | FLEET      | MEDIUM   | `licenseExpiresAt <= now + settings.expiryWarningDays` | Driver   | License date updated or driver archived |
| `CUSTOMER_AT_RISK`                   | CUSTOMERS  | LOW      | `status = AT_RISK` (manual status, not auto-computed) | Customer | Status changed away from AT_RISK |

#### Settings-Gated Rules

- **Low-severity rules** (INVOICE_DUE_SOON, CUSTOMER_AT_RISK) are only run if `settings.lowSeverityEnabled = true`.
- **Category gating**: If a category is not in `settings.enabledCategories`, all its rules are skipped.

#### Resolved-Condition Lifecycle

When an entity no longer qualifies for a rule:
1. Service calls `reconcileRule()` with an empty qualifying list
2. All previously-open notifications of that type are updated: `isArchived = true, archivedAt = now`
3. Archived notifications remain in the database (not deleted) for audit/history
4. Next list fetch excludes archived notifications (unless explicitly filtered to include them)

---

### GET `/notifications`

**Roles**: ADMIN, OPERATIONS_MANAGER, DISPATCHER, ACCOUNTANT, SALES_CRM_MANAGER; **Row-level filtering by role category**

Returns paginated notifications with role-based filtering.

#### Query Parameters

```
page?=1                     // Default: 1, starts at 1
limit?=20                   // Default: 20, max reasonable ~100
category?=OPERATIONS        // Filter by NotificationCategory
severity?=HIGH              // Filter by NotificationSeverity
isRead?=false|true          // Filter by read state
isArchived?=false           // Default: false (only show active); pass true to see archived
sortBy?=createdAt|severity  // Default: createdAt
sortOrder?=desc|asc         // Default: desc
```

#### Response

```typescript
{
  items: Notification[];
  meta: {
    page: number;
    limit: number;
    total: number;           // Total matching (ignoring pagination)
    totalPages: number;
  };
  unreadCount: number;       // Unread count in this org (role-filtered, not paginated)
}
```

#### Row-Level Filtering by Role

- **ADMIN**: sees all notifications
- **OPERATIONS_MANAGER, DISPATCHER**: see only `category in ["OPERATIONS", "FLEET"]`
- **ACCOUNTANT**: sees only `category in ["FINANCE"]`
- **SALES_CRM_MANAGER**: sees only `category in ["CUSTOMERS"]`
- **DRIVER**: denied access (403)

---

### GET `/notifications/unread-count`

**Roles**: ADMIN, OPERATIONS_MANAGER, DISPATCHER, ACCOUNTANT, SALES_CRM_MANAGER

Returns unread count for the user's role.

#### Response

```typescript
{ unreadCount: number }
```

---

### GET `/notifications/settings`

**Roles**: ADMIN only

Returns org's notification settings (created lazily on first read).

#### Response

```typescript
{
  enabledCategories: ["OPERATIONS", "FINANCE", "CUSTOMERS", "FLEET"];  // Defaults to all
  invoiceDueSoonDays: 3;                                                // 1–90, default 3
  creditLimitWarningPercent: 80;                                        // 1–100, default 80
  expiryWarningDays: 30;                                                // 1–365, default 30
  lowSeverityEnabled: true;                                             // Default true
}
```

---

### PATCH `/notifications/settings`

**Roles**: ADMIN only

Updates org's notification settings.

#### Request Body

```typescript
{
  enabledCategories?: ["OPERATIONS", "FINANCE"];  // Partial update OK
  invoiceDueSoonDays?: 5;
  creditLimitWarningPercent?: 90;
  expiryWarningDays?: 14;
  lowSeverityEnabled?: false;
}
```

#### Response

Same as GET `/notifications/settings` (full updated settings object).

---

### POST `/notifications/:id/read`

**Roles**: ADMIN, OPERATIONS_MANAGER, DISPATCHER, ACCOUNTANT, SALES_CRM_MANAGER

Marks a single notification as read.

#### Response

Updated `Notification` object with `isRead: true, readAt: <now>`.

---

### POST `/notifications/:id/unread`

**Roles**: ADMIN, OPERATIONS_MANAGER, DISPATCHER, ACCOUNTANT, SALES_CRM_MANAGER

Marks a single notification as unread.

#### Response

Updated `Notification` object with `isRead: false, readAt: null`.

---

### POST `/notifications/:id/archive`

**Roles**: ADMIN, OPERATIONS_MANAGER, DISPATCHER, ACCOUNTANT, SALES_CRM_MANAGER

Archives (resolves) a single notification.

#### Response

Updated `Notification` object with `isArchived: true, archivedAt: <now>`.

---

### POST `/notifications/read-all`

**Roles**: ADMIN, OPERATIONS_MANAGER, DISPATCHER, ACCOUNTANT, SALES_CRM_MANAGER; **only updates visible to role**

Marks all unread, visible-to-role notifications as read.

#### Response

```typescript
{ updatedCount: number }
```

---

### POST `/notifications/archive-all`

**Roles**: ADMIN, OPERATIONS_MANAGER, DISPATCHER, ACCOUNTANT, SALES_CRM_MANAGER; **only archives visible to role**

Archives all visible-to-role, non-archived notifications.

#### Response

```typescript
{ updatedCount: number }
```

---

## API Mode vs. Demo Mode

### Connected Mode (API Mode)

- All data fetched from real `/reports/*` and `/notifications` endpoints
- Multi-tenant isolation enforced server-side
- Role-based filtering server-side
- Settings stored in `NotificationSettings` table
- Org-scoped seed data in `FlowERP Test Logistics` test organization

### Demo Mode

- Reports derived client-side from localStorage mock data (see `apps/web/src/lib/reports-data.ts`)
- Notifications derived client-side from live mock data (see `apps/web/src/lib/notifications.ts`)
- Settings from `localStorage["flowerp:notification-settings:v1"]`
- No role-based access control
- No server persistence

**Frontend conditional logic** (see `apps/web/src/lib/data-mode.ts`):
```typescript
if (getDataMode() !== "api") {
  return <DemoReportsView />; // Uses localStorage
}
return <ReportsConnectedView />; // Uses API
```

---

## Limitations & Future Work

### This Phase
- ✅ Multi-tenant isolation
- ✅ Role-based access and row filtering
- ✅ Read-only reports (no snapshots/history)
- ✅ Lazy notification generation (on-read, not cron)
- ✅ CSV export (no PDF)
- ✅ Org-scoped settings

### Phase 2+
- Real-time notifications via WebSocket (gateway skeleton exists in `notifications.gateway.ts`, not wired to frontend)
- Scheduled report generation and email delivery
- Report snapshot history
- PDF export
- Driver access to their own notification dashboard
- Automated notification retries / batching
- Background worker for cron-based notification deduplication (currently on-read only)

---

## Testing

### Test Organization: `FlowERP Test Logistics`

Seed via: `npm run seed:test-org`

Includes:
- All order statuses: DRAFT, PENDING, ASSIGNED, IN_TRANSIT, DELIVERED, CANCELLED
- Delayed orders (for ORDER_DELAYED notification)
- Unassigned orders (for ORDER_UNASSIGNED notification)
- Orders spanning past 30 days (for time-series reports)
- Invoices: PAID, PARTIALLY_PAID, OVERDUE, DRAFT, CANCELLED, DUE_SOON
- Expenses: APPROVED, PENDING, REJECTED (multiple categories)
- Negative-profit delivered order (revenue 100, expenses 130+)
- Customer near credit limit (80% utilization)
- Customer exceeding credit limit (125% utilization)
- Driver with license expiry in 7 days
- Vehicles with insurance expiry (14 days) and inspection expiry (1 day)
- All 6 membership roles (ADMIN, OPERATIONS_MANAGER, DISPATCHER, ACCOUNTANT, SALES_CRM_MANAGER, DRIVER)

### E2E Tests

- `apps/api/test/reports.e2e-spec.ts` — tenant isolation, filter validation, calculations, CSV escaping, role access
- `apps/api/test/notifications.e2e-spec.ts` — rule generation, deduplication, resolved-condition cleanup, settings, role-based filtering

Run via: `npm run test:e2e`

---

## Error Handling

All endpoints return standard error envelopes:

```typescript
{
  error: {
    statusCode: number;
    message: string;
    details?: string;
  }
}
```

Common cases:
- **401 Unauthorized**: Missing or invalid JWT
- **403 Forbidden**: Authenticated but role not in `@Roles(...)` or org-scoped access denied
- **400 Bad Request**: Invalid filter values (bad enum, out-of-range numbers, malformed dates)
- **404 Not Found**: Org not found, or cross-org access attempt
- **500 Internal Server Error**: Unexpected server error (timezone resolution failure, database error, etc.)
