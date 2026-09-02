-- AlterTable: add soft-link from Geofence to DispatchStop.
-- Nullable, no FK — same rationale as linkedDispatchId (no cascade on stop archive).
ALTER TABLE "geofences" ADD COLUMN "linkedDispatchStopId" TEXT;
