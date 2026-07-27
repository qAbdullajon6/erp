-- Fleet Tracking Phase 1 foundation:
--   * TrackingSession — low-cardinality presence / heartbeat lease
--   * Scale indexes for driver live-state and driver history lookups
-- Additive only; existing telematics tables and APIs remain unchanged.

CREATE TYPE "TrackingSessionSource" AS ENUM ('DRIVER_APP', 'DEVICE', 'STAFF', 'API');
CREATE TYPE "TrackingSessionStatus" AS ENUM ('ACTIVE', 'ENDED');

CREATE TABLE "tracking_sessions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "driverId" TEXT,
    "deviceId" TEXT,
    "dispatchId" TEXT,
    "source" "TrackingSessionSource" NOT NULL,
    "status" "TrackingSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPositionAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracking_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tracking_sessions_organizationId_status_lastHeartbeatAt_idx"
  ON "tracking_sessions"("organizationId", "status", "lastHeartbeatAt");

CREATE INDEX "tracking_sessions_organizationId_vehicleId_status_idx"
  ON "tracking_sessions"("organizationId", "vehicleId", "status");

CREATE INDEX "tracking_sessions_organizationId_driverId_status_idx"
  ON "tracking_sessions"("organizationId", "driverId", "status");

CREATE INDEX "tracking_sessions_organizationId_dispatchId_status_idx"
  ON "tracking_sessions"("organizationId", "dispatchId", "status");

CREATE INDEX "tracking_sessions_organizationId_deviceId_status_idx"
  ON "tracking_sessions"("organizationId", "deviceId", "status");

ALTER TABLE "tracking_sessions"
  ADD CONSTRAINT "tracking_sessions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tracking_sessions"
  ADD CONSTRAINT "tracking_sessions_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tracking_sessions"
  ADD CONSTRAINT "tracking_sessions_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "drivers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tracking_sessions"
  ADD CONSTRAINT "tracking_sessions_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "telematics_devices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tracking_sessions"
  ADD CONSTRAINT "tracking_sessions_dispatchId_fkey"
  FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- One ACTIVE session per (org, vehicle, source) when a vehicle is bound.
-- Null vehicleId rows are excluded so unbound device sessions remain flexible.
CREATE UNIQUE INDEX "tracking_sessions_one_active_per_vehicle_source"
  ON "tracking_sessions"("organizationId", "vehicleId", "source")
  WHERE "status" = 'ACTIVE' AND "vehicleId" IS NOT NULL;

-- Driver history + live-state lookup paths for /tracking/drivers and history.
CREATE INDEX "gps_positions_organizationId_driverId_recordedAt_idx"
  ON "gps_positions"("organizationId", "driverId", "recordedAt");

CREATE INDEX "vehicle_telematics_states_organizationId_driverId_idx"
  ON "vehicle_telematics_states"("organizationId", "driverId");
