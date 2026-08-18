-- AlterTable
ALTER TABLE "dispatch_delivery_proofs" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "driver_breaks" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "organization_driver_settings" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "orders_organizationId_createdAt_idx" ON "orders"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_organizationId_pickupDate_idx" ON "orders"("organizationId", "pickupDate");
