-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriptionEventType" AS ENUM ('CREATED', 'UPGRADED', 'DOWNGRADED', 'RENEWED', 'SUSPENDED', 'REACTIVATED', 'CANCELLED', 'EXPIRED', 'SEATS_ADDED', 'SEATS_REMOVED', 'PAYMENT_FAILED', 'TRIAL_STARTED', 'TRIAL_ENDED');

-- CreateEnum
CREATE TYPE "PaymentProviderType" AS ENUM ('STRIPE', 'CLICK', 'PAYME');

-- CreateEnum
CREATE TYPE "UsageMetricType" AS ENUM ('API_REQUESTS', 'AI_CREDITS', 'STORAGE_GB', 'ORDERS', 'WEBHOOKS', 'USERS', 'VEHICLES', 'DRIVERS', 'CUSTOMERS');

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "annualPrice" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "features" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "seats" INTEGER,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "cancelAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "paymentCustomerId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_history" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventType" "SubscriptionEventType" NOT NULL,
    "fromPlanId" TEXT,
    "toPlanId" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "metricType" "UsageMetricType" NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_snapshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT,
    "metricType" "UsageMetricType" NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_provider_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "providerType" "PaymentProviderType" NOT NULL,
    "config" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_name_key" ON "subscription_plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_slug_key" ON "subscription_plans"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organization_subscriptions_organizationId_key" ON "organization_subscriptions"("organizationId");

-- CreateIndex
CREATE INDEX "organization_subscriptions_status_idx" ON "organization_subscriptions"("status");

-- CreateIndex
CREATE INDEX "organization_subscriptions_currentPeriodEnd_idx" ON "organization_subscriptions"("currentPeriodEnd");

-- CreateIndex
CREATE INDEX "organization_subscriptions_trialEndsAt_idx" ON "organization_subscriptions"("trialEndsAt");

-- CreateIndex
CREATE INDEX "subscription_history_subscriptionId_createdAt_idx" ON "subscription_history"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "subscription_history_organizationId_eventType_createdAt_idx" ON "subscription_history"("organizationId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "usage_records_organizationId_metricType_recordedAt_idx" ON "usage_records"("organizationId", "metricType", "recordedAt");

-- CreateIndex
CREATE INDEX "usage_records_organizationId_periodStart_periodEnd_idx" ON "usage_records"("organizationId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "usage_snapshots_organizationId_metricType_period_periodSt_key" ON "usage_snapshots"("organizationId", "metricType", "period", "periodStart");

-- CreateIndex
CREATE INDEX "usage_snapshots_organizationId_metricType_periodStart_idx" ON "usage_snapshots"("organizationId", "metricType", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_configs_organizationId_providerType_key" ON "payment_provider_configs"("organizationId", "providerType");

-- CreateIndex
CREATE INDEX "payment_provider_configs_organizationId_isActive_isPrimary_idx" ON "payment_provider_configs"("organizationId", "isActive", "isPrimary");

-- AddForeignKey
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "organization_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_fromPlanId_fkey" FOREIGN KEY ("fromPlanId") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_toPlanId_fkey" FOREIGN KEY ("toPlanId") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "organization_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_snapshots" ADD CONSTRAINT "usage_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_provider_configs" ADD CONSTRAINT "payment_provider_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
