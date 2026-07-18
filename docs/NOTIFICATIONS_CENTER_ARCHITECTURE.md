# Notifications Center + Email Infrastructure - Architecture

**Date:** 2026-07-17  
**Status:** Evolution Plan  
**Existing System:** In-app notifications with lazy reconcile (769 lines)

---

## Executive Summary

**Approach:** Evolution, not rewrite. The existing `NotificationsService` with its lazy-reconcile rule engine (ORDER_DELAYED, INVOICE_OVERDUE, etc.) stays intact as the **source** of notification events. We're adding:

1. **Multi-channel delivery** (email, SMS, push, webhooks) via a dispatcher
2. **Template engine** for customizable message formatting
3. **Delivery queue** with retry, priority, scheduling
4. **User preferences** for channel/category/timing control
5. **Notification center UI** (inbox, archive, bulk actions, realtime updates)
6. **Email infrastructure** (provider abstraction: SMTP, Resend, SendGrid, SES)
7. **Tracking** (opens, clicks, bounces)

**Preservation:** Existing `Notification` model, role-based category filtering, org-scoping, reconcile logic, customer portal notifications.

---

## Existing System Audit

### What Exists (Preserve 100%)

**Backend (`src/notifications/`):**
- `NotificationsService.refresh()` — lazy reconcile engine with 11 rule types
- Role-based category filtering (`categoriesForRole()` from `notification-roles.util.ts`)
- `NotificationSettings` per-org (enabled categories, thresholds)
- REST API: list, mark read, update settings
- Customer portal integration (`customer-notifications.service.ts`)

**Database:**
- `Notification` table (id, org, type, category, severity, title, message, entityType, entityId, isRead, isArchived, metadata)
- `NotificationSettings` table (org settings, thresholds)
- `CustomerNotificationRead` table (portal read tracking)

**Frontend:**
- Topbar notification icon (unread count)
- Notifications route (`/app/notifications`)
- Basic list component (no inbox UI yet)

### What's Missing (Build)

1. ❌ Email/SMS/Push delivery
2. ❌ Template engine
3. ❌ Delivery queue
4. ❌ User preferences (per-channel, quiet hours, digest)
5. ❌ Email provider abstraction
6. ❌ Tracking (opens, clicks, bounces)
7. ❌ Inbox UI (search, filters, bulk actions, realtime)
8. ❌ Workflow integration
9. ❌ AI copilot tools

---

## Architecture Overview

```
Existing NotificationsService.refresh()
    ↓ (rules generate in-app notifications)
    ↓
[NEW] NotificationDispatcher
    ├─► Check UserPreferences (channel, quiet hours, digest)
    ├─► Render Template (if email/SMS)
    ├─► Enqueue to DeliveryQueue
    │
    └─► DeliveryQueue Worker
        ├─► In-App: Already persisted
        ├─► Email: EmailService → ProviderRegistry → SMTP/Resend/SendGrid/SES
        ├─► SMS: SMSService → ProviderRegistry → Twilio/MessageBird (abstraction)
        ├─► Push: PushService → Firebase/APNs (abstraction)
        └─► Webhook: DeveloperPortalWebhook (reuse existing)
```

**Key principle:** Existing `refresh()` is the **source of truth** for what notifications to generate. Dispatcher is a **passive consumer** that routes to channels.

---

## Database Schema Additions

### New Tables

**1. `notification_templates`**
```prisma
model NotificationTemplate {
  id              String   @id @default(uuid())
  organizationId  String?  // null = system template
  key             String   // "invoice_overdue", "order_delayed", etc.
  name            String
  description     String?
  channel         NotificationChannel // EMAIL, SMS, PUSH, IN_APP
  subject         String?  // For email
  bodyHtml        String?  // HTML template
  bodyText        String   // Plain text (fallback)
  variables       Json     // Array of variable names: ["customerName", "invoiceNumber", ...]
  isActive        Boolean  @default(true)
  version         Int      @default(1)
  locale          String   @default("en")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  createdBy       String?
  
  organization    Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  history         NotificationTemplateVersion[]
  
  @@unique([organizationId, key, channel, locale])
  @@index([organizationId, isActive])
  @@map("notification_templates")
}

model NotificationTemplateVersion {
  id         String   @id @default(uuid())
  templateId String
  version    Int
  subject    String?
  bodyHtml   String?
  bodyText   String
  variables  Json
  createdAt  DateTime @default(now())
  createdBy  String?
  
  template   NotificationTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  
  @@unique([templateId, version])
  @@map("notification_template_versions")
}
```

**2. `notification_delivery_queue`**
```prisma
model NotificationDeliveryQueue {
  id              String   @id @default(uuid())
  organizationId  String
  notificationId  String?  // Link to Notification if in-app
  userId          String
  channel         NotificationChannel
  priority        Int      @default(5)  // 1=highest, 10=lowest
  scheduledFor    DateTime @default(now())
  status          DeliveryStatus @default(PENDING)
  attempts        Int      @default(0)
  maxAttempts     Int      @default(3)
  lastError       String?
  payload         Json     // Rendered template + metadata
  sentAt          DateTime?
  createdAt       DateTime @default(now())
  
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  
  @@index([status, scheduledFor, priority])
  @@index([organizationId, userId, channel])
  @@map("notification_delivery_queue")
}

enum DeliveryStatus {
  PENDING
  SENDING
  SENT
  FAILED
  DEAD_LETTER
}
```

**3. `notification_preferences`**
```prisma
model NotificationPreferences {
  id                String   @id @default(uuid())
  userId            String   @unique
  emailEnabled      Boolean  @default(true)
  smsEnabled        Boolean  @default(false)
  pushEnabled       Boolean  @default(false)
  webhookEnabled    Boolean  @default(false)
  digestMode        Boolean  @default(false)  // false = instant
  quietHoursStart   Int?     // Hour 0-23 (user's timezone)
  quietHoursEnd     Int?
  categoryPrefs     Json     // Per-category channel overrides
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@map("notification_preferences")
}
```

**4. `email_providers`**
```prisma
model EmailProvider {
  id              String   @id @default(uuid())
  organizationId  String?  // null = system default
  providerType    EmailProviderType
  name            String
  isActive        Boolean  @default(true)
  isPrimary       Boolean  @default(false)
  config          Json     // Encrypted credentials
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  organization    Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  
  @@index([organizationId, isActive, isPrimary])
  @@map("email_providers")
}

enum EmailProviderType {
  SMTP
  RESEND
  SENDGRID
  AWS_SES
}
```

**5. `email_tracking`**
```prisma
model EmailTracking {
  id              String   @id @default(uuid())
  deliveryQueueId String   @unique
  messageId       String?  // Provider's message ID
  openCount       Int      @default(0)
  clickCount      Int      @default(0)
  firstOpenedAt   DateTime?
  lastOpenedAt    DateTime?
  firstClickedAt  DateTime?
  lastClickedAt   DateTime?
  bounced         Boolean  @default(false)
  bouncedAt       DateTime?
  bounceReason    String?
  
  @@index([messageId])
  @@map("email_tracking")
}
```

### New Enums

```prisma
enum NotificationChannel {
  IN_APP
  EMAIL
  SMS
  PUSH
  WEBHOOK
}
```

---

## Implementation Strategy

### Phase 1: Foundation (Tasks 23-24)
- Database schema + migration
- Verify against seeded data
- Additive changes only (no breaking changes to existing Notification table)

### Phase 2: Core Services (Tasks 25-28)
- Email provider abstraction (4 providers)
- Template engine (render, preview, version history)
- Delivery queue service + worker
- Preferences service

### Phase 3: Integration (Tasks 29-35)
- Multi-channel dispatcher (wraps existing refresh())
- Email tracking (opens, clicks, bounces)
- Notification center API (enhanced endpoints)
- Workflow action integration
- Developer portal webhooks
- Customer portal enhancements
- AI copilot tools

### Phase 4: Frontend (Tasks 36-39)
- Notification center UI (inbox, filters, bulk actions)
- Preference center UI
- Template management UI (admin)
- Realtime updates via SSE

### Phase 5: Verification (Tasks 40-46)
- E2E tests (backend + frontend + Playwright)
- Security review (org-scoping, RBAC, HTML sanitization)
- Performance review (batch sending, queue throughput)
- Regression verification
- Documentation
- Engineering report

---

## Key Design Decisions

### 1. Preserve Existing Reconcile Engine

**Decision:** Keep `NotificationsService.refresh()` as the single source of notification generation.

**Rationale:** The lazy-reconcile pattern (refresh on read) with auto-archive (when condition resolves) is correct and tested. Don't replace working code.

### 2. Dispatcher Pattern

**Decision:** New `NotificationDispatcher` consumes notifications from `refresh()` and routes to channels.

**Rationale:** Separation of concerns. Generation logic (refresh) independent of delivery logic (dispatcher).

### 3. Template Key Matching

**Decision:** Template `key` matches notification `type` (e.g., "ORDER_DELAYED" → template key "order_delayed").

**Rationale:** Convention-based mapping. No magic config. Easy to trace.

### 4. Delivery Queue Worker

**Decision:** Single queue table, worker polls by status/priority/scheduledFor.

**Rationale:** Simpler than separate queue per channel. Priority and scheduling built-in.

### 5. Email Provider Abstraction

**Decision:** `EmailProvider` interface with 4 implementations (SMTP, Resend, SendGrid, SES).

**Rationale:** Multi-provider support, org-level or system-level config, failover capability.

### 6. Quiet Hours Enforcement

**Decision:** Dispatcher checks preferences, delays delivery if in quiet hours.

**Rationale:** User-controlled, per-user setting, respects timezones.

### 7. Digest Mode (Deferred)

**Decision:** Tracked as technical debt. Instant mode only in Phase 1.

**Rationale:** Digest requires aggregation logic + scheduled job. Instant mode covers 90% of use cases.

### 8. SMS/Push Abstraction (Deferred)

**Decision:** Define interface, defer provider implementations to TD.

**Rationale:** Email is primary channel. SMS/Push need third-party accounts (Twilio, Firebase).

---

## Security Considerations

1. **Org-scoping:** All queries filter by `organizationId`
2. **RBAC:** Existing role-based category filtering preserved
3. **HTML sanitization:** Templates sanitized on save and render
4. **Email header injection:** Parameterized sending, no string interpolation
5. **Rate limiting:** Per-org send limits in delivery queue
6. **Audit logging:** All template changes, preference changes logged
7. **Secrets management:** Provider credentials encrypted in `config` JSON

---

## Performance Considerations

1. **Batch sending:** Queue worker processes in batches (100 at a time)
2. **Connection pooling:** Email provider clients reuse connections
3. **Indexes:** Added on `status`, `scheduledFor`, `priority` for queue queries
4. **Lazy template loading:** Templates cached per-org
5. **Async delivery:** Queue + worker pattern, HTTP responses don't wait for send

---

## Technical Debt (Deliberate Deferrals)

Will be documented in `TECHNICAL_DEBT.md`:

1. **TD-NOTIF-01:** Digest mode deferred (instant only in Phase 1)
2. **TD-NOTIF-02:** SMS provider implementations deferred (interface defined)
3. **TD-NOTIF-03:** Push notification providers deferred (interface defined)
4. **TD-NOTIF-04:** Template localization deferred (structure ready, single locale "en")
5. **TD-NOTIF-05:** Email SPF/DKIM verification deferred (provider-handled for now)

---

## Testing Strategy

**Backend E2E:**
- Notification generation → dispatch → queue → delivery (mocked providers)
- Template rendering with variables
- Preference enforcement (quiet hours, channel toggles)
- Retry logic + dead-letter queue
- RBAC enforcement
- Org-scoping

**Frontend:**
- Component tests (notification list, inbox UI, preferences)
- Playwright E2E (full user journey: receive notification, mark read, archive, bulk actions, realtime updates)

**Regression:**
- Existing notification reconcile unchanged
- Customer portal notifications unchanged
- Role-based filtering unchanged

---

## API Surface Additions

**Notification Center:**
- `GET /notifications` (enhanced: search, filter, pagination)
- `POST /notifications/:id/read`
- `POST /notifications/:id/unread`
- `POST /notifications/:id/archive`
- `DELETE /notifications/:id`
- `POST /notifications/bulk-read`
- `POST /notifications/bulk-archive`
- `POST /notifications/mark-all-read`

**Templates (ADMIN/OPS_MANAGER only):**
- `GET /notifications/templates`
- `POST /notifications/templates`
- `GET /notifications/templates/:id`
- `PATCH /notifications/templates/:id`
- `DELETE /notifications/templates/:id`
- `GET /notifications/templates/:id/preview` (POST with sample data)
- `GET /notifications/templates/:id/versions`

**Preferences:**
- `GET /notifications/preferences`
- `PATCH /notifications/preferences`

**Providers (ADMIN only):**
- `GET /notifications/providers`
- `POST /notifications/providers`
- `PATCH /notifications/providers/:id`
- `DELETE /notifications/providers/:id`

---

**Next:** Proceed to Task #23 (database schema design).
