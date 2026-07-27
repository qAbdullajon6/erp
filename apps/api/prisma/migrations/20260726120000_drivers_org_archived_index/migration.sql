-- Default Drivers list is organizationId + archivedAt IS NULL. Without this
-- index Postgres falls back to the org-only index and filters archived in
-- memory once fleets grow.
CREATE INDEX IF NOT EXISTS "drivers_organizationId_archivedAt_idx"
  ON "drivers"("organizationId", "archivedAt");
