-- CreateEnum
CREATE TYPE "CustomerPortalAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkflowExecutionStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "WorkflowStepStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED', 'CANCELLED', 'WAITING');

-- CreateEnum
CREATE TYPE "TelematicsProviderType" AS ENUM ('MANUAL', 'TRACCAR', 'SAMSARA', 'GEOTAB', 'GENERIC_WEBHOOK');

-- CreateEnum
CREATE TYPE "MovementState" AS ENUM ('MOVING', 'IDLING', 'STOPPED', 'OFFLINE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GeofenceType" AS ENUM ('CIRCLE', 'POLYGON');

-- CreateEnum
CREATE TYPE "GeofenceEventType" AS ENUM ('ENTER', 'EXIT', 'DWELL');

-- CreateEnum
CREATE TYPE "TelematicsAlertType" AS ENUM ('SPEEDING', 'GEOFENCE_ENTER', 'GEOFENCE_EXIT', 'GEOFENCE_DWELL', 'IDLE', 'STOP', 'HARSH_ACCEL', 'HARSH_BRAKE', 'HARSH_CORNER', 'SIGNAL_LOST', 'DEVICE_OFFLINE', 'LOW_FUEL', 'UNAUTHORIZED_MOVEMENT', 'CHECK_ENGINE');

-- CreateEnum
CREATE TYPE "TelematicsAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "EmailProviderType" AS ENUM ('SMTP', 'RESEND', 'SENDGRID', 'AWS_SES');

-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'BILLING';

-- CreateTable
CREATE TABLE "customer_portal_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "CustomerPortalAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_portal_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_refresh_tokens" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_notification_reads" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_notification_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedSeq" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_versions" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedByUserId" TEXT NOT NULL,

    CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_executions" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "versionId" TEXT,
    "organizationId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "eventPayload" JSONB,
    "status" "WorkflowExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "context" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "timeoutMs" INTEGER NOT NULL DEFAULT 300000,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_execution_steps" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "actionConfig" JSONB NOT NULL,
    "status" "WorkflowStepStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "workflow_execution_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_logs" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "step" TEXT,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "config" JSONB NOT NULL,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_schedules" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_webhooks" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCalledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telematics_devices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "provider" "TelematicsProviderType" NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ingestSecretHash" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "telematics_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gps_positions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deviceId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT,
    "tripId" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "altitudeM" DOUBLE PRECISION,
    "speedKph" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "accuracyM" DOUBLE PRECISION,
    "ignitionOn" BOOLEAN,
    "odometerKm" DOUBLE PRECISION,
    "fuelLevelPct" DOUBLE PRECISION,
    "satellites" INTEGER,
    "distanceFromPrevM" DOUBLE PRECISION,
    "movementState" "MovementState" NOT NULL DEFAULT 'UNKNOWN',
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gps_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_telematics_states" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT,
    "tripId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "speedKph" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "ignitionOn" BOOLEAN,
    "odometerKm" DOUBLE PRECISION,
    "fuelLevelPct" DOUBLE PRECISION,
    "movementState" "MovementState" NOT NULL DEFAULT 'UNKNOWN',
    "lastMovingAt" TIMESTAMP(3),
    "stationarySince" TIMESTAMP(3),
    "lastRecordedAt" TIMESTAMP(3),
    "lastReceivedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_telematics_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT,
    "dispatchId" TEXT,
    "orderId" TEXT,
    "status" "TripStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "startLat" DOUBLE PRECISION,
    "startLng" DOUBLE PRECISION,
    "endLat" DOUBLE PRECISION,
    "endLng" DOUBLE PRECISION,
    "distanceKm" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "movingSec" INTEGER NOT NULL DEFAULT 0,
    "idleSec" INTEGER NOT NULL DEFAULT 0,
    "stopCount" INTEGER NOT NULL DEFAULT 0,
    "maxSpeedKph" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgSpeedKph" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "harshAccelCount" INTEGER NOT NULL DEFAULT 0,
    "harshBrakeCount" INTEGER NOT NULL DEFAULT 0,
    "harshCornerCount" INTEGER NOT NULL DEFAULT 0,
    "speedingCount" INTEGER NOT NULL DEFAULT 0,
    "fuelConsumedL" DECIMAL(12,3),
    "startOdometerKm" DOUBLE PRECISION,
    "endOdometerKm" DOUBLE PRECISION,
    "pointCount" INTEGER NOT NULL DEFAULT 0,
    "autoClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geofences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "GeofenceType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "centerLat" DOUBLE PRECISION,
    "centerLng" DOUBLE PRECISION,
    "radiusM" DOUBLE PRECISION,
    "polygon" JSONB,
    "color" TEXT,
    "category" TEXT,
    "linkedCustomerId" TEXT,
    "alertOnEnter" BOOLEAN NOT NULL DEFAULT false,
    "alertOnExit" BOOLEAN NOT NULL DEFAULT false,
    "dwellThresholdSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "geofences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geofence_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "geofenceId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT,
    "tripId" TEXT,
    "type" "GeofenceEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "dwellSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geofence_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telematics_alerts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "TelematicsAlertType" NOT NULL,
    "severity" "NotificationSeverity" NOT NULL,
    "status" "TelematicsAlertStatus" NOT NULL DEFAULT 'OPEN',
    "vehicleId" TEXT,
    "driverId" TEXT,
    "tripId" TEXT,
    "geofenceId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "value" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "dedupeKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telematics_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_health_snapshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "deviceId" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "odometerKm" DOUBLE PRECISION,
    "engineHours" DOUBLE PRECISION,
    "fuelLevelPct" DOUBLE PRECISION,
    "batteryVoltage" DOUBLE PRECISION,
    "coolantTempC" DOUBLE PRECISION,
    "engineTempC" DOUBLE PRECISION,
    "checkEngineOn" BOOLEAN,
    "dtcCodes" JSONB,
    "tirePressures" JSONB,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_health_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telematics_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "speedLimitKph" INTEGER NOT NULL DEFAULT 90,
    "speedingToleranceKph" INTEGER NOT NULL DEFAULT 10,
    "idleThresholdSec" INTEGER NOT NULL DEFAULT 300,
    "stopThresholdSec" INTEGER NOT NULL DEFAULT 180,
    "offlineThresholdSec" INTEGER NOT NULL DEFAULT 600,
    "harshAccelMs2" DOUBLE PRECISION NOT NULL DEFAULT 3.5,
    "harshBrakeMs2" DOUBLE PRECISION NOT NULL DEFAULT 3.5,
    "harshCornerMs2" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "tripAutoCloseSec" INTEGER NOT NULL DEFAULT 600,
    "lowFuelThresholdPct" INTEGER NOT NULL DEFAULT 15,
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "speedingAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "idleAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "geofenceAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "harshDrivingAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "offlineAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "healthAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telematics_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "subject" TEXT,
    "bodyHtml" TEXT,
    "bodyText" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_template_versions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "subject" TEXT,
    "bodyHtml" TEXT,
    "bodyText" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "notification_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_delivery_queue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "notificationId" TEXT,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "payload" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_delivery_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "webhookEnabled" BOOLEAN NOT NULL DEFAULT false,
    "digestMode" BOOLEAN NOT NULL DEFAULT false,
    "digestTime" INTEGER DEFAULT 9,
    "quietHoursStart" INTEGER,
    "quietHoursEnd" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "categoryPrefs" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_providers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "providerType" "EmailProviderType" NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "replyToEmail" TEXT,
    "config" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_tracking" (
    "id" TEXT NOT NULL,
    "deliveryQueueId" TEXT NOT NULL,
    "messageId" TEXT,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "firstOpenedAt" TIMESTAMP(3),
    "lastOpenedAt" TIMESTAMP(3),
    "firstClickedAt" TIMESTAMP(3),
    "lastClickedAt" TIMESTAMP(3),
    "bounced" BOOLEAN NOT NULL DEFAULT false,
    "bouncedAt" TIMESTAMP(3),
    "bounceReason" TEXT,

    CONSTRAINT "email_tracking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_portal_accounts_customerId_key" ON "customer_portal_accounts"("customerId");

-- CreateIndex
CREATE INDEX "customer_portal_accounts_customerId_idx" ON "customer_portal_accounts"("customerId");

-- CreateIndex
CREATE INDEX "customer_portal_accounts_organizationId_idx" ON "customer_portal_accounts"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_portal_accounts_organizationId_email_key" ON "customer_portal_accounts"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "customer_refresh_tokens_tokenHash_key" ON "customer_refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "customer_refresh_tokens_accountId_idx" ON "customer_refresh_tokens"("accountId");

-- CreateIndex
CREATE INDEX "customer_refresh_tokens_organizationId_idx" ON "customer_refresh_tokens"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_notification_reads_accountId_key_key" ON "customer_notification_reads"("accountId", "key");

-- CreateIndex
CREATE INDEX "payment_webhook_deliveries_provider_externalEventId_idx" ON "payment_webhook_deliveries"("provider", "externalEventId");

-- CreateIndex
CREATE INDEX "payment_webhook_deliveries_status_createdAt_idx" ON "payment_webhook_deliveries"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_deliveries_provider_externalEventId_eventTy_key" ON "payment_webhook_deliveries"("provider", "externalEventId", "eventType");

-- CreateIndex
CREATE INDEX "workflows_organizationId_status_idx" ON "workflows"("organizationId", "status");

-- CreateIndex
CREATE INDEX "workflows_organizationId_active_idx" ON "workflows"("organizationId", "active");

-- CreateIndex
CREATE INDEX "workflow_versions_organizationId_idx" ON "workflow_versions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_versions_workflowId_version_key" ON "workflow_versions"("workflowId", "version");

-- CreateIndex
CREATE INDEX "workflow_executions_workflowId_status_idx" ON "workflow_executions"("workflowId", "status");

-- CreateIndex
CREATE INDEX "workflow_executions_organizationId_status_idx" ON "workflow_executions"("organizationId", "status");

-- CreateIndex
CREATE INDEX "workflow_executions_status_startedAt_idx" ON "workflow_executions"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_executions_organizationId_idempotencyKey_key" ON "workflow_executions"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "workflow_execution_steps_executionId_stepIndex_idx" ON "workflow_execution_steps"("executionId", "stepIndex");

-- CreateIndex
CREATE INDEX "workflow_logs_executionId_createdAt_idx" ON "workflow_logs"("executionId", "createdAt");

-- CreateIndex
CREATE INDEX "workflow_templates_category_idx" ON "workflow_templates"("category");

-- CreateIndex
CREATE INDEX "workflow_schedules_active_nextRunAt_idx" ON "workflow_schedules"("active", "nextRunAt");

-- CreateIndex
CREATE INDEX "workflow_schedules_organizationId_idx" ON "workflow_schedules"("organizationId");

-- CreateIndex
CREATE INDEX "workflow_webhooks_active_idx" ON "workflow_webhooks"("active");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_webhooks_organizationId_path_key" ON "workflow_webhooks"("organizationId", "path");

-- CreateIndex
CREATE INDEX "telematics_devices_organizationId_idx" ON "telematics_devices"("organizationId");

-- CreateIndex
CREATE INDEX "telematics_devices_organizationId_vehicleId_idx" ON "telematics_devices"("organizationId", "vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "telematics_devices_organizationId_provider_externalId_key" ON "telematics_devices"("organizationId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "gps_positions_organizationId_vehicleId_recordedAt_idx" ON "gps_positions"("organizationId", "vehicleId", "recordedAt");

-- CreateIndex
CREATE INDEX "gps_positions_tripId_recordedAt_idx" ON "gps_positions"("tripId", "recordedAt");

-- CreateIndex
CREATE INDEX "gps_positions_organizationId_recordedAt_idx" ON "gps_positions"("organizationId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_telematics_states_vehicleId_key" ON "vehicle_telematics_states"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_telematics_states_organizationId_movementState_idx" ON "vehicle_telematics_states"("organizationId", "movementState");

-- CreateIndex
CREATE INDEX "trips_organizationId_vehicleId_startedAt_idx" ON "trips"("organizationId", "vehicleId", "startedAt");

-- CreateIndex
CREATE INDEX "trips_organizationId_status_idx" ON "trips"("organizationId", "status");

-- CreateIndex
CREATE INDEX "trips_dispatchId_idx" ON "trips"("dispatchId");

-- CreateIndex
CREATE INDEX "trips_driverId_idx" ON "trips"("driverId");

-- CreateIndex
CREATE INDEX "geofences_organizationId_active_idx" ON "geofences"("organizationId", "active");

-- CreateIndex
CREATE INDEX "geofence_events_organizationId_geofenceId_occurredAt_idx" ON "geofence_events"("organizationId", "geofenceId", "occurredAt");

-- CreateIndex
CREATE INDEX "geofence_events_organizationId_vehicleId_occurredAt_idx" ON "geofence_events"("organizationId", "vehicleId", "occurredAt");

-- CreateIndex
CREATE INDEX "telematics_alerts_organizationId_status_occurredAt_idx" ON "telematics_alerts"("organizationId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "telematics_alerts_organizationId_vehicleId_occurredAt_idx" ON "telematics_alerts"("organizationId", "vehicleId", "occurredAt");

-- CreateIndex
CREATE INDEX "telematics_alerts_organizationId_type_occurredAt_idx" ON "telematics_alerts"("organizationId", "type", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "telematics_alerts_organizationId_dedupeKey_key" ON "telematics_alerts"("organizationId", "dedupeKey");

-- CreateIndex
CREATE INDEX "vehicle_health_snapshots_organizationId_vehicleId_recordedA_idx" ON "vehicle_health_snapshots"("organizationId", "vehicleId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "telematics_settings_organizationId_key" ON "telematics_settings"("organizationId");

-- CreateIndex
CREATE INDEX "notification_templates_organizationId_isActive_idx" ON "notification_templates"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "notification_templates_key_channel_isActive_idx" ON "notification_templates"("key", "channel", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_organizationId_key_channel_locale_key" ON "notification_templates"("organizationId", "key", "channel", "locale");

-- CreateIndex
CREATE INDEX "notification_template_versions_templateId_createdAt_idx" ON "notification_template_versions"("templateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_template_versions_templateId_version_key" ON "notification_template_versions"("templateId", "version");

-- CreateIndex
CREATE INDEX "notification_delivery_queue_status_scheduledFor_priority_idx" ON "notification_delivery_queue"("status", "scheduledFor", "priority");

-- CreateIndex
CREATE INDEX "notification_delivery_queue_organizationId_userId_channel_idx" ON "notification_delivery_queue"("organizationId", "userId", "channel");

-- CreateIndex
CREATE INDEX "notification_delivery_queue_organizationId_status_idx" ON "notification_delivery_queue"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- CreateIndex
CREATE INDEX "email_providers_organizationId_isActive_isPrimary_idx" ON "email_providers"("organizationId", "isActive", "isPrimary");

-- CreateIndex
CREATE INDEX "email_providers_providerType_isActive_idx" ON "email_providers"("providerType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "email_providers_organizationId_isPrimary_key" ON "email_providers"("organizationId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "email_tracking_deliveryQueueId_key" ON "email_tracking"("deliveryQueueId");

-- CreateIndex
CREATE INDEX "email_tracking_messageId_idx" ON "email_tracking"("messageId");

-- CreateIndex
CREATE INDEX "email_tracking_deliveryQueueId_idx" ON "email_tracking"("deliveryQueueId");

-- AddForeignKey
ALTER TABLE "customer_portal_accounts" ADD CONSTRAINT "customer_portal_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_portal_accounts" ADD CONSTRAINT "customer_portal_accounts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refresh_tokens" ADD CONSTRAINT "customer_refresh_tokens_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "customer_portal_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refresh_tokens" ADD CONSTRAINT "customer_refresh_tokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notification_reads" ADD CONSTRAINT "customer_notification_reads_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "customer_portal_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "workflow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_execution_steps" ADD CONSTRAINT "workflow_execution_steps_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "workflow_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_logs" ADD CONSTRAINT "workflow_logs_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "workflow_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_schedules" ADD CONSTRAINT "workflow_schedules_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_schedules" ADD CONSTRAINT "workflow_schedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_webhooks" ADD CONSTRAINT "workflow_webhooks_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_webhooks" ADD CONSTRAINT "workflow_webhooks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telematics_devices" ADD CONSTRAINT "telematics_devices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telematics_devices" ADD CONSTRAINT "telematics_devices_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_positions" ADD CONSTRAINT "gps_positions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_positions" ADD CONSTRAINT "gps_positions_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "telematics_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_positions" ADD CONSTRAINT "gps_positions_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_positions" ADD CONSTRAINT "gps_positions_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_positions" ADD CONSTRAINT "gps_positions_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_telematics_states" ADD CONSTRAINT "vehicle_telematics_states_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_telematics_states" ADD CONSTRAINT "vehicle_telematics_states_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_telematics_states" ADD CONSTRAINT "vehicle_telematics_states_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_geofenceId_fkey" FOREIGN KEY ("geofenceId") REFERENCES "geofences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telematics_alerts" ADD CONSTRAINT "telematics_alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telematics_alerts" ADD CONSTRAINT "telematics_alerts_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telematics_alerts" ADD CONSTRAINT "telematics_alerts_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telematics_alerts" ADD CONSTRAINT "telematics_alerts_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telematics_alerts" ADD CONSTRAINT "telematics_alerts_geofenceId_fkey" FOREIGN KEY ("geofenceId") REFERENCES "geofences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telematics_alerts" ADD CONSTRAINT "telematics_alerts_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telematics_alerts" ADD CONSTRAINT "telematics_alerts_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_health_snapshots" ADD CONSTRAINT "vehicle_health_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_health_snapshots" ADD CONSTRAINT "vehicle_health_snapshots_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_health_snapshots" ADD CONSTRAINT "vehicle_health_snapshots_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "telematics_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telematics_settings" ADD CONSTRAINT "telematics_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_template_versions" ADD CONSTRAINT "notification_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notification_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_delivery_queue" ADD CONSTRAINT "notification_delivery_queue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_delivery_queue" ADD CONSTRAINT "notification_delivery_queue_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_providers" ADD CONSTRAINT "email_providers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_tracking" ADD CONSTRAINT "email_tracking_deliveryQueueId_fkey" FOREIGN KEY ("deliveryQueueId") REFERENCES "notification_delivery_queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "usage_snapshots_organizationId_metricType_period_periodSt_key" RENAME TO "usage_snapshots_organizationId_metricType_period_periodStar_key";

