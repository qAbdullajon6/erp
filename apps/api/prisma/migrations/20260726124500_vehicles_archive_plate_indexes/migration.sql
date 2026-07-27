-- Default Vehicles list is organizationId + archivedAt IS NULL.
CREATE INDEX IF NOT EXISTS "vehicles_organizationId_archivedAt_idx"
  ON "vehicles"("organizationId", "archivedAt");

-- One live (non-archived) plate per organization. Archived rows may keep the
-- plate so history stays intact; restore re-checks for collisions.
CREATE UNIQUE INDEX IF NOT EXISTS "vehicles_one_live_plate_per_org"
  ON "vehicles"("organizationId", "plateNumber")
  WHERE "archivedAt" IS NULL;
