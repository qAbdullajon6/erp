-- Platform Console foundation: notifications, support tickets, feature flags, support sessions.

CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "PlatformNotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "FeatureFlagScope" AS ENUM ('ALL', 'PLAN', 'ORG');

CREATE TABLE "platform_notifications" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "PlatformNotificationSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_notifications_isRead_createdAt_idx" ON "platform_notifications"("isRead", "createdAt");
CREATE INDEX "platform_notifications_type_createdAt_idx" ON "platform_notifications"("type", "createdAt");

CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "assigneeUserId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_tickets_status_createdAt_idx" ON "support_tickets"("status", "createdAt");
CREATE INDEX "support_tickets_organizationId_idx" ON "support_tickets"("organizationId");
CREATE INDEX "support_tickets_assigneeUserId_idx" ON "support_tickets"("assigneeUserId");

CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabledGlobal" BOOLEAN NOT NULL DEFAULT false,
    "scope" "FeatureFlagScope" NOT NULL DEFAULT 'ALL',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

CREATE TABLE "feature_flag_overrides" (
    "id" TEXT NOT NULL,
    "featureFlagId" TEXT NOT NULL,
    "planId" TEXT,
    "organizationId" TEXT,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flag_overrides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feature_flag_overrides_featureFlagId_idx" ON "feature_flag_overrides"("featureFlagId");
CREATE INDEX "feature_flag_overrides_planId_idx" ON "feature_flag_overrides"("planId");
CREATE INDEX "feature_flag_overrides_organizationId_idx" ON "feature_flag_overrides"("organizationId");

CREATE TABLE "platform_support_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "homeMembershipId" TEXT NOT NULL,
    "targetOrganizationId" TEXT NOT NULL,
    "targetMembershipId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "platform_support_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_support_sessions_userId_endedAt_idx" ON "platform_support_sessions"("userId", "endedAt");
CREATE INDEX "platform_support_sessions_targetOrganizationId_idx" ON "platform_support_sessions"("targetOrganizationId");

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_featureFlagId_fkey" FOREIGN KEY ("featureFlagId") REFERENCES "feature_flags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_support_sessions" ADD CONSTRAINT "platform_support_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_support_sessions" ADD CONSTRAINT "platform_support_sessions_targetOrganizationId_fkey" FOREIGN KEY ("targetOrganizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
