-- Phase 6-6: Route Optimization Foundation
-- Adds optimizationLocked to route_stops so dispatchers can pin stops
-- that must not be moved during automatic route optimization.

ALTER TABLE "route_stops" ADD COLUMN "optimizationLocked" BOOLEAN NOT NULL DEFAULT false;
