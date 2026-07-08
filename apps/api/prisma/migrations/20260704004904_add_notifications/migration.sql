-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('OPERATIONS', 'FINANCE', 'CUSTOMERS', 'FLEET');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "severity" "NotificationSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enabledCategories" JSONB NOT NULL,
    "invoiceDueSoonDays" INTEGER NOT NULL DEFAULT 3,
    "creditLimitWarningPercent" INTEGER NOT NULL DEFAULT 80,
    "expiryWarningDays" INTEGER NOT NULL DEFAULT 30,
    "lowSeverityEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_organizationId_idx" ON "notifications"("organizationId");

-- CreateIndex
CREATE INDEX "notifications_organizationId_isArchived_isRead_idx" ON "notifications"("organizationId", "isArchived", "isRead");

-- CreateIndex
CREATE INDEX "notifications_organizationId_type_entityId_idx" ON "notifications"("organizationId", "type", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_settings_organizationId_key" ON "notification_settings"("organizationId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce "at most one OPEN notification per type+entity" at the database
-- level (not expressible as a plain @@unique in Prisma's schema DSL, since
-- it needs to exclude archived rows) — same technique as Invoice's
-- active-order-per-invoice partial index. NotificationsService checks this
-- too, but this closes the race window between check-and-create.
CREATE UNIQUE INDEX "notifications_active_dedupe_unique" ON "notifications" ("organizationId", "type", "entityId") WHERE "isArchived" = false;
