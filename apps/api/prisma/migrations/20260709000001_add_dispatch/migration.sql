-- CreateEnum DispatchStatus
CREATE TYPE "DispatchStatus" AS ENUM ('DRAFT', 'ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

-- CreateTable dispatches
CREATE TABLE "dispatches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dispatchNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "status" "DispatchStatus" NOT NULL DEFAULT 'DRAFT',
    "pickupDateScheduled" TIMESTAMP(3) NOT NULL,
    "pickupDateActual" TIMESTAMP(3),
    "deliveryDateScheduled" TIMESTAMP(3) NOT NULL,
    "deliveryDateActual" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable dispatch_status_histories
CREATE TABLE "dispatch_status_histories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "status" "DispatchStatus" NOT NULL,
    "changedByUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_status_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dispatches_organizationId_dispatchNumber_key" ON "dispatches"("organizationId", "dispatchNumber");

-- CreateIndex
CREATE INDEX "dispatches_organizationId_idx" ON "dispatches"("organizationId");

-- CreateIndex
CREATE INDEX "dispatches_organizationId_status_idx" ON "dispatches"("organizationId", "status");

-- CreateIndex
CREATE INDEX "dispatches_orderId_idx" ON "dispatches"("orderId");

-- CreateIndex
CREATE INDEX "dispatches_driverId_idx" ON "dispatches"("driverId");

-- CreateIndex
CREATE INDEX "dispatches_vehicleId_idx" ON "dispatches"("vehicleId");

-- CreateIndex
CREATE INDEX "dispatch_status_histories_organizationId_idx" ON "dispatch_status_histories"("organizationId");

-- CreateIndex
CREATE INDEX "dispatch_status_histories_dispatchId_idx" ON "dispatch_status_histories"("dispatchId");

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_status_histories" ADD CONSTRAINT "dispatch_status_histories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_status_histories" ADD CONSTRAINT "dispatch_status_histories_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_status_histories" ADD CONSTRAINT "dispatch_status_histories_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
