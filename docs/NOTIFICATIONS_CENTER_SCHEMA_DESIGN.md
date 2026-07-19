# Notifications Center - Database Schema Design

**Date:** 2026-07-17  
**Status:** Design Complete - Ready for Implementation  
**Next Session:** Apply migration and implement services

---

## Schema Additions to `prisma/schema.prisma`

### New Enums

```prisma
enum NotificationChannel {
  IN_APP
  EMAIL
  SMS
  PUSH
  WEBHOOK
}

enum DeliveryStatus {
  PENDING
  SENDING
  SENT
  FAILED
  DEAD_LETTER
}

enum EmailProviderType {
  SMTP
  RESEND
  SENDGRID
  AWS_SES
}
```

### Table 1: notification_templates

**Purpose:** Store customizable notification templates with version history.

```prisma
model NotificationTemplate {
  id              String   @id @default(uuid())
  organizationId  String?  // null = system-wide template
  key             String   // "order_delayed", "invoice_overdue" (matches notification.type)
  name            String
  description     String?
  channel         NotificationChannel
  subject         String?  // For EMAIL channel
  bodyHtml        String?  // HTML version
  bodyText        String   // Plain text (required, fallback)
  variables       Json     // String[] of variable names: ["customerName", "orderNumber"]
  isActive        Boolean  @default(true)
  version         Int      @default(1)
  locale          String   @default("en")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  createdBy       String?  // User ID who created
  
  organization    Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  history         NotificationTemplateVersion[]
  
  @@unique([organizationId, key, channel, locale])
  @@index([organizationId, isActive])
  @@index([key, channel, isActive])
  @@map("notification_templates")
}
```

**Notes:**
- `organizationId` null = system template (used by all orgs without custom override)
- `key` convention: lowercase_snake_case matching notification.type
- `variables` JSON array validated at runtime: `["customerName", "orderNumber", "dueDate"]`
- Version increments on update, old version saved to history table

### Table 2: notification_template_versions

**Purpose:** Version history for template changes.

```prisma
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
  @@index([templateId, createdAt])
  @@map("notification_template_versions")
}
```

**Notes:**
- Immutable records (no updates, no deletes except cascade)
- Enables template rollback and audit trail

### Table 3: notification_delivery_queue

**Purpose:** Delivery queue with priority, retry, dead-letter handling.

```prisma
model NotificationDeliveryQueue {
  id              String         @id @default(uuid())
  organizationId  String
  notificationId  String?        // Link to Notification (for IN_APP)
  userId          String
  channel         NotificationChannel
  priority        Int            @default(5)  // 1=highest, 10=lowest
  scheduledFor    DateTime       @default(now())
  status          DeliveryStatus @default(PENDING)
  attempts        Int            @default(0)
  maxAttempts     Int            @default(3)
  lastError       String?
  payload         Json           // Rendered template + metadata
  sentAt          DateTime?
  createdAt       DateTime       @default(now())
  
  organization    Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  notification    Notification?  @relation(fields: [notificationId], references: [id], onDelete: SetNull)
  tracking        EmailTracking?
  
  @@index([status, scheduledFor, priority])
  @@index([organizationId, userId, channel])
  @@index([organizationId, status])
  @@map("notification_delivery_queue")
}
```

**Notes:**
- Worker queries: `WHERE status = 'PENDING' AND scheduledFor <= NOW() ORDER BY priority ASC, scheduledFor ASC LIMIT 100`
- `payload` JSON structure:
  ```typescript
  {
    to: string,              // Email/phone/device token
    subject?: string,        // For EMAIL
    body: string,            // Rendered template
    metadata: {
      templateKey: string,
      variables: Record<string, any>
    }
  }
  ```
- Retry logic: exponential backoff (30s, 2m, 10m)
- After `maxAttempts`, status → `DEAD_LETTER`

### Table 4: notification_preferences

**Purpose:** Per-user channel and timing preferences.

```prisma
model NotificationPreferences {
  id                String   @id @default(uuid())
  userId            String   @unique
  emailEnabled      Boolean  @default(true)
  smsEnabled        Boolean  @default(false)
  pushEnabled       Boolean  @default(false)
  webhookEnabled    Boolean  @default(false)
  digestMode        Boolean  @default(false)  // false = instant, true = daily digest
  digestTime        Int?     @default(9)      // Hour 0-23 for digest delivery
  quietHoursStart   Int?     // Hour 0-23
  quietHoursEnd     Int?     // Hour 0-23
  timezone          String   @default("UTC")
  categoryPrefs     Json     // Per-category channel overrides
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map("notification_preferences")
}
```

**Notes:**
- `categoryPrefs` JSON structure:
  ```typescript
  {
    "OPERATIONS": { emailEnabled: true, smsEnabled: false },
    "FINANCE": { emailEnabled: true, smsEnabled: true },
    // ...
  }
  ```
- Quiet hours in user's timezone
- Digest mode: aggregate notifications, send once daily at `digestTime`

### Table 5: email_providers

**Purpose:** Provider abstraction for SMTP/Resend/SendGrid/SES.

```prisma
model EmailProvider {
  id              String            @id @default(uuid())
  organizationId  String?           // null = system default
  providerType    EmailProviderType
  name            String
  isActive        Boolean           @default(true)
  isPrimary       Boolean           @default(false)
  fromEmail       String
  fromName        String
  replyToEmail    String?
  config          String            // Encrypted JSON credentials
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  
  organization    Organization?     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  
  @@unique([organizationId, isPrimary])  // Only one primary per org
  @@index([organizationId, isActive, isPrimary])
  @@index([providerType, isActive])
  @@map("email_providers")
}
```

**Notes:**
- `config` encrypted with app secret, JSON structure per provider:
  - SMTP: `{ host, port, user, password, secure }`
  - Resend: `{ apiKey }`
  - SendGrid: `{ apiKey }`
  - AWS_SES: `{ region, accessKeyId, secretAccessKey }`
- Primary provider used first, fallback to non-primary if primary fails
- System default (organizationId=null) used if org has no provider configured

### Table 6: email_tracking

**Purpose:** Track email opens, clicks, bounces.

```prisma
model EmailTracking {
  id              String   @id @default(uuid())
  deliveryQueueId String   @unique
  messageId       String?  // Provider's message ID (for webhook correlation)
  openCount       Int      @default(0)
  clickCount      Int      @default(0)
  firstOpenedAt   DateTime?
  lastOpenedAt    DateTime?
  firstClickedAt  DateTime?
  lastClickedAt   DateTime?
  bounced         Boolean  @default(false)
  bouncedAt       DateTime?
  bounceReason    String?
  
  deliveryQueue   NotificationDeliveryQueue @relation(fields: [deliveryQueueId], references: [id], onDelete: Cascade)
  
  @@index([messageId])
  @@index([deliveryQueueId])
  @@map("email_tracking")
}
```

**Notes:**
- Open tracking: 1x1 transparent pixel `GET /track/open/:trackingId`
- Click tracking: redirect proxy `GET /track/click/:trackingId?url=...`
- Bounce handling: provider webhook → update record
- Privacy: tracking optional, configurable per-org

---

## Existing Schema Modifications

### Notification Model - Add Relations

```prisma
// Add to existing Notification model:
model Notification {
  // ... existing fields ...
  
  deliveryQueue NotificationDeliveryQueue[]  // NEW
  
  // ... existing relations ...
}
```

### Organization Model - Add Relations

```prisma
// Add to existing Organization model:
model Organization {
  // ... existing fields ...
  
  notificationTemplates   NotificationTemplate[]      // NEW
  emailProviders          EmailProvider[]             // NEW
  deliveryQueue           NotificationDeliveryQueue[] // NEW
  
  // ... existing relations ...
}
```

### User Model - Add Relation

```prisma
// Add to existing User model:
model User {
  // ... existing fields ...
  
  notificationPreferences NotificationPreferences?  // NEW
  
  // ... existing relations ...
}
```

---

## Migration Strategy

### Step 1: Create Migration

```bash
npx prisma migrate dev --name add_notification_center_infrastructure
```

### Step 2: Validate Migration SQL

**Check for:**
- All new tables have `organizationId` indexes
- Enums defined before table references
- Unique constraints on correct combinations
- Foreign keys with appropriate `onDelete` actions
- No destructive changes to existing tables

### Step 3: Seed Default Templates

**Create seed data for system templates:**
- `order_delayed` (EMAIL, SMS, IN_APP)
- `invoice_overdue` (EMAIL, IN_APP)
- `invoice_due_soon` (EMAIL, IN_APP)
- `customer_credit_limit_exceeded` (EMAIL, IN_APP)
- etc. (11 rule types × 2 channels average = 22 system templates)

### Step 4: Migration Rollback Plan

**If needed:**
```sql
-- Drop tables in reverse dependency order
DROP TABLE email_tracking;
DROP TABLE notification_delivery_queue;
DROP TABLE notification_template_versions;
DROP TABLE notification_templates;
DROP TABLE notification_preferences;
DROP TABLE email_providers;

-- Drop enums
DROP TYPE NotificationChannel;
DROP TYPE DeliveryStatus;
DROP TYPE EmailProviderType;
```

---

## Index Rationale

**notification_templates:**
- `(organizationId, isActive)` — List org's active templates
- `(key, channel, isActive)` — Lookup template by notification type

**notification_delivery_queue:**
- `(status, scheduledFor, priority)` — Worker query (most critical)
- `(organizationId, userId, channel)` — User's pending deliveries
- `(organizationId, status)` — Org-level queue monitoring

**email_tracking:**
- `(messageId)` — Webhook lookup by provider message ID
- `(deliveryQueueId)` — Already unique, but indexed for foreign key

---

## Data Validation Rules

**Template Variables:**
- Variable names: alphanumeric + underscore only
- Max 50 variables per template
- Reserved names: `organizationName`, `userName`, `appUrl`

**Preferences:**
- `quietHoursStart` < 24, `quietHoursEnd` < 24
- If quiet hours set, both start and end required
- Timezone: valid IANA timezone string

**Delivery Queue:**
- `priority` 1-10 only
- `scheduledFor` not more than 30 days in future
- `maxAttempts` 1-10 only

---

## Performance Considerations

**Estimated Row Growth:**
- **Templates:** ~100 per org (11 system + custom overrides × channels)
- **Delivery Queue:** High volume, retention 30 days (archive older)
- **Email Tracking:** 1:1 with email deliveries, retention 90 days
- **Preferences:** 1 per user (low volume)
- **Providers:** ~2 per org (primary + backup)

**Partitioning Strategy (Future):**
- `notification_delivery_queue` by `createdAt` (monthly partitions)
- `email_tracking` by `firstOpenedAt` / `createdAt` (monthly partitions)

**Archival Strategy:**
- Delivery queue: move to archive table after 30 days
- Email tracking: aggregate to summary stats after 90 days

---

## Security Notes

**Email Provider Config Encryption:**
```typescript
// Encrypt before storing
const encrypted = encrypt(JSON.stringify(config), process.env.APP_SECRET);
await prisma.emailProvider.create({
  data: { config: encrypted, ... }
});

// Decrypt on load
const provider = await prisma.emailProvider.findUnique(...);
const config = JSON.parse(decrypt(provider.config, process.env.APP_SECRET));
```

**HTML Sanitization:**
- Template `bodyHtml` sanitized on save
- Use `DOMPurify` or similar (allow safe tags only: `p`, `br`, `strong`, `em`, `a`, `ul`, `ol`, `li`)
- Strip `<script>`, `<iframe>`, `onclick`, etc.

**Email Header Injection Protection:**
- Validate `fromEmail`, `replyToEmail` against RFC 5322
- No newlines in subject/from/to fields
- Use provider SDKs (parameterized sending) instead of raw SMTP

---

## Next Session Implementation Order

1. **Apply Migration** (Task #24)
2. **Email Providers** (Task #25) — Critical path
3. **Template Engine** (Task #26) — Rendering + variables
4. **Delivery Queue** (Task #27) — Worker + retry logic
5. **Preferences Service** (Task #28)
6. **Dispatcher Integration** (Task #29) — Wraps existing NotificationsService
7. **Continue with remaining tasks...**

---

**Status:** Architecture and schema design complete. Ready for implementation in next session.
