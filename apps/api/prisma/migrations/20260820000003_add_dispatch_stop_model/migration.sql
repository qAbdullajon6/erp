-- Phase 5B — DispatchStop snapshot foundation.
--
-- Creates the StopType enum and dispatch_stops table. Each new Dispatch receives
-- exactly two snapshot rows (PICKUP and DELIVERY) created atomically alongside the
-- Dispatch itself. Pre-existing Dispatch rows have no stops — this is intentional
-- and backwards-compatible.

-- CreateEnum
CREATE TYPE "StopType" AS ENUM ('PICKUP', 'INTERMEDIATE', 'DELIVERY');

-- CreateTable
CREATE TABLE "dispatch_stops" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dispatchId"     TEXT NOT NULL,
    "stopIndex"      INTEGER NOT NULL,
    "stopType"       "StopType" NOT NULL,
    "address"        TEXT NOT NULL,
    "city"           TEXT NOT NULL,
    "postalCode"     TEXT,
    "countryCode"    TEXT,
    "lat"            DECIMAL(10,7),
    "lng"            DECIMAL(10,7),
    "placeName"      TEXT,
    "contactName"    TEXT,
    "contactPhone"   TEXT,
    "instructions"   TEXT,
    "windowStart"    TIMESTAMP(3),
    "windowEnd"      TIMESTAMP(3),
    "arrivedAt"      TIMESTAMP(3),
    "completedAt"    TIMESTAMP(3),
    "failedAt"       TIMESTAMP(3),
    "failureReason"  TEXT,
    "failureNotes"   TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_stops_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "dispatch_stops"
    ADD CONSTRAINT "dispatch_stops_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dispatch_stops"
    ADD CONSTRAINT "dispatch_stops_dispatchId_fkey"
    FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
-- The unique constraint is the primary guard: two stops at the same index on the
-- same dispatch are physically impossible.
CREATE UNIQUE INDEX "dispatch_stops_dispatchId_stopIndex_key"
    ON "dispatch_stops"("dispatchId", "stopIndex");

CREATE INDEX "dispatch_stops_organizationId_idx"
    ON "dispatch_stops"("organizationId");

CREATE INDEX "dispatch_stops_dispatchId_idx"
    ON "dispatch_stops"("dispatchId");

CREATE INDEX "dispatch_stops_dispatchId_stopIndex_idx"
    ON "dispatch_stops"("dispatchId", "stopIndex");

CREATE INDEX "dispatch_stops_organizationId_stopType_idx"
    ON "dispatch_stops"("organizationId", "stopType");
