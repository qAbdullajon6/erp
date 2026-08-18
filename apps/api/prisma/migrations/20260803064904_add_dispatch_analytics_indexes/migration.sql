-- CreateIndex
CREATE INDEX "dispatch_status_histories_organizationId_status_createdAt_idx" ON "dispatch_status_histories"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "dispatches_organizationId_createdAt_idx" ON "dispatches"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "dispatches_organizationId_pickupDateScheduled_idx" ON "dispatches"("organizationId", "pickupDateScheduled");
