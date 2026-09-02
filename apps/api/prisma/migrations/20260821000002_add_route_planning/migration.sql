-- Phase 6-1: Route Planning Foundation
-- Adds Route and RouteStop tables for manual route planning.
-- The existing Dispatch lifecycle is unchanged; routes are a planning layer on top.

CREATE TYPE "RouteStatus" AS ENUM ('DRAFT', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "RouteStopStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED');

CREATE TABLE "routes" (
    "id"              TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "routeNumber"     TEXT NOT NULL,
    "status"          "RouteStatus" NOT NULL DEFAULT 'DRAFT',
    "driverId"        TEXT,
    "vehicleId"       TEXT,
    "plannedDate"     DATE NOT NULL,
    "startTime"       TIMESTAMP(3),
    "endTime"         TIMESTAMP(3),
    "totalDistanceM"  INTEGER,
    "totalDurationSec" INTEGER,
    "notes"           TEXT,
    "createdByUserId" TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "route_stops" (
    "id"                  TEXT NOT NULL,
    "organizationId"      TEXT NOT NULL,
    "routeId"             TEXT NOT NULL,
    "sequence"            INTEGER NOT NULL,
    "orderId"             TEXT,
    "dispatchId"          TEXT,
    "label"               TEXT,
    "address"             TEXT NOT NULL,
    "city"                TEXT NOT NULL,
    "lat"                 DECIMAL(10,7),
    "lng"                 DECIMAL(10,7),
    "plannedArrival"      TIMESTAMP(3),
    "plannedDeparture"    TIMESTAMP(3),
    "distanceFromPrevM"   INTEGER,
    "durationFromPrevSec" INTEGER,
    "status"              "RouteStopStatus" NOT NULL DEFAULT 'PENDING',
    "notes"               TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "routes_organizationId_routeNumber_key" ON "routes"("organizationId", "routeNumber");
CREATE UNIQUE INDEX "route_stops_routeId_sequence_key" ON "route_stops"("routeId", "sequence");

-- Performance indexes
CREATE INDEX "routes_organizationId_status_idx" ON "routes"("organizationId", "status");
CREATE INDEX "routes_organizationId_plannedDate_idx" ON "routes"("organizationId", "plannedDate");
CREATE INDEX "routes_driverId_idx" ON "routes"("driverId");
CREATE INDEX "routes_vehicleId_idx" ON "routes"("vehicleId");
CREATE INDEX "route_stops_organizationId_routeId_idx" ON "route_stops"("organizationId", "routeId");
CREATE INDEX "route_stops_orderId_idx" ON "route_stops"("orderId");
CREATE INDEX "route_stops_dispatchId_idx" ON "route_stops"("dispatchId");

-- Foreign keys
ALTER TABLE "routes" ADD CONSTRAINT "routes_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "routes" ADD CONSTRAINT "routes_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "routes" ADD CONSTRAINT "routes_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "routes" ADD CONSTRAINT "routes_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_routeId_fkey"
    FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_dispatchId_fkey"
    FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
