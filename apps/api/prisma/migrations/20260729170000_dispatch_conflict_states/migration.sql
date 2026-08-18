-- P3.3.2E — persist dispatcher ignore/resolve decisions for conflict engine.
CREATE TABLE "dispatch_conflict_states" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "conflictKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "ignoredAt" TIMESTAMP(3),
    "ignoredByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatch_conflict_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dispatch_conflict_states_dispatchId_conflictKey_key" ON "dispatch_conflict_states"("dispatchId", "conflictKey");
CREATE INDEX "dispatch_conflict_states_organizationId_dispatchId_idx" ON "dispatch_conflict_states"("organizationId", "dispatchId");

ALTER TABLE "dispatch_conflict_states" ADD CONSTRAINT "dispatch_conflict_states_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispatch_conflict_states" ADD CONSTRAINT "dispatch_conflict_states_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispatch_conflict_states" ADD CONSTRAINT "dispatch_conflict_states_ignoredByUserId_fkey" FOREIGN KEY ("ignoredByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispatch_conflict_states" ADD CONSTRAINT "dispatch_conflict_states_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
