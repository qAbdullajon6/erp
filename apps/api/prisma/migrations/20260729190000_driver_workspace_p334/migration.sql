-- P3.3.4 / P3.3.4A — Driver Workspace additive schema

CREATE TYPE "DriverOperationalStatus" AS ENUM ('AVAILABLE', 'BUSY', 'DRIVING', 'LOADING', 'BREAK', 'OFFLINE');
CREATE TYPE "DriverAcceptanceStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
CREATE TYPE "DriverRejectReason" AS ENUM ('VEHICLE_ISSUE', 'SICK', 'PERSONAL_EMERGENCY', 'ALREADY_BUSY', 'OTHER');
CREATE TYPE "DeliveryProofType" AS ENUM ('PHOTO', 'SIGNATURE');

ALTER TABLE "drivers"
  ADD COLUMN IF NOT EXISTS "operationalStatus" "DriverOperationalStatus" NOT NULL DEFAULT 'AVAILABLE';

CREATE INDEX IF NOT EXISTS "drivers_organizationId_operationalStatus_idx"
  ON "drivers"("organizationId", "operationalStatus");

ALTER TABLE "dispatches"
  ADD COLUMN IF NOT EXISTS "driverAcceptanceStatus" "DriverAcceptanceStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "driverAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "driverRejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "driverRejectReason" "DriverRejectReason",
  ADD COLUMN IF NOT EXISTS "driverRejectNote" TEXT,
  ADD COLUMN IF NOT EXISTS "arrivalLat" DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS "arrivalLng" DECIMAL(10,7);

CREATE INDEX IF NOT EXISTS "dispatches_organizationId_driverAcceptanceStatus_idx"
  ON "dispatches"("organizationId", "driverAcceptanceStatus");

ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "receiptPath" TEXT,
  ADD COLUMN IF NOT EXISTS "odometerKm" DECIMAL(12,1);

CREATE TABLE IF NOT EXISTS "organization_driver_settings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requirePhotos" BOOLEAN NOT NULL DEFAULT true,
  "requireSignature" BOOLEAN NOT NULL DEFAULT true,
  "requireReceiverName" BOOLEAN NOT NULL DEFAULT true,
  "requireReceiverPhone" BOOLEAN NOT NULL DEFAULT false,
  "requireNotes" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_driver_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_driver_settings_organizationId_key"
  ON "organization_driver_settings"("organizationId");

ALTER TABLE "organization_driver_settings"
  ADD CONSTRAINT "organization_driver_settings_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "driver_breaks" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_breaks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "driver_breaks_organizationId_driverId_idx"
  ON "driver_breaks"("organizationId", "driverId");
CREATE INDEX IF NOT EXISTS "driver_breaks_driverId_endedAt_idx"
  ON "driver_breaks"("driverId", "endedAt");

ALTER TABLE "driver_breaks"
  ADD CONSTRAINT "driver_breaks_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "driver_breaks"
  ADD CONSTRAINT "driver_breaks_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "drivers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "driver_action_events" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "dispatchId" TEXT,
  "type" TEXT NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_action_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "driver_action_events_organizationId_driverId_createdAt_idx"
  ON "driver_action_events"("organizationId", "driverId", "createdAt");
CREATE INDEX IF NOT EXISTS "driver_action_events_organizationId_type_createdAt_idx"
  ON "driver_action_events"("organizationId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "driver_action_events_dispatchId_idx"
  ON "driver_action_events"("dispatchId");

ALTER TABLE "driver_action_events"
  ADD CONSTRAINT "driver_action_events_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "driver_action_events"
  ADD CONSTRAINT "driver_action_events_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "drivers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "vehicle_inspections" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "dispatchId" TEXT,
  "checklist" JSONB NOT NULL,
  "photos" JSONB,
  "odometerKm" DECIMAL(12,1),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vehicle_inspections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vehicle_inspections_organizationId_driverId_idx"
  ON "vehicle_inspections"("organizationId", "driverId");
CREATE INDEX IF NOT EXISTS "vehicle_inspections_organizationId_vehicleId_idx"
  ON "vehicle_inspections"("organizationId", "vehicleId");

ALTER TABLE "vehicle_inspections"
  ADD CONSTRAINT "vehicle_inspections_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_inspections"
  ADD CONSTRAINT "vehicle_inspections_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "drivers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_inspections"
  ADD CONSTRAINT "vehicle_inspections_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "dispatch_delivery_proofs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "dispatchId" TEXT NOT NULL,
  "orderId" TEXT,
  "uploadedByUserId" TEXT NOT NULL,
  "driverId" TEXT,
  "type" "DeliveryProofType" NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSizeBytes" INTEGER,
  "storagePath" TEXT NOT NULL,
  "receiverName" TEXT,
  "receiverPhone" TEXT,
  "notes" TEXT,
  "odometerKm" DECIMAL(12,1),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dispatch_delivery_proofs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "dispatch_delivery_proofs_organizationId_dispatchId_idx"
  ON "dispatch_delivery_proofs"("organizationId", "dispatchId");
CREATE INDEX IF NOT EXISTS "dispatch_delivery_proofs_dispatchId_type_idx"
  ON "dispatch_delivery_proofs"("dispatchId", "type");

ALTER TABLE "dispatch_delivery_proofs"
  ADD CONSTRAINT "dispatch_delivery_proofs_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispatch_delivery_proofs"
  ADD CONSTRAINT "dispatch_delivery_proofs_dispatchId_fkey"
  FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispatch_delivery_proofs"
  ADD CONSTRAINT "dispatch_delivery_proofs_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "drivers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
