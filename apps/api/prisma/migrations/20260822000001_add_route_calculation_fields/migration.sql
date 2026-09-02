-- Phase 6-5: Route Metrics & Geometry
-- Adds calculation metadata and stored route geometry to the routes table.

ALTER TABLE "routes" ADD COLUMN "calculatedAt" TIMESTAMP(3);
ALTER TABLE "routes" ADD COLUMN "calculationStatus" TEXT;
ALTER TABLE "routes" ADD COLUMN "geometry" TEXT;
