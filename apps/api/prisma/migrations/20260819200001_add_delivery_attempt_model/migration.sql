-- AlterTable: failure fields on Dispatch (all nullable, only populated on DELIVERY_FAILED).
ALTER TABLE "dispatches"
  ADD COLUMN "failureReason" "DeliveryFailureReason",
  ADD COLUMN "failureNotes"  TEXT,
  ADD COLUMN "failedAt"      TIMESTAMP(3);

-- CreateTable: append-only delivery attempt history.
CREATE TABLE "delivery_attempts" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "dispatchId"     TEXT NOT NULL,
  "orderId"        TEXT NOT NULL,
  "driverId"       TEXT,
  "failureReason"  "DeliveryFailureReason" NOT NULL,
  "notes"          TEXT,
  "lat"            DECIMAL(10,7),
  "lng"            DECIMAL(10,7),
  "occurredAt"     TIMESTAMP(3) NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey constraints for delivery_attempts.
ALTER TABLE "delivery_attempts"
  ADD CONSTRAINT "delivery_attempts_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_attempts"
  ADD CONSTRAINT "delivery_attempts_dispatchId_fkey"
  FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_attempts"
  ADD CONSTRAINT "delivery_attempts_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_attempts"
  ADD CONSTRAINT "delivery_attempts_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for delivery_attempts.
CREATE INDEX "delivery_attempts_organizationId_idx" ON "delivery_attempts"("organizationId");
CREATE INDEX "delivery_attempts_dispatchId_idx"     ON "delivery_attempts"("dispatchId");
CREATE INDEX "delivery_attempts_orderId_idx"        ON "delivery_attempts"("orderId");

-- Recreate the "one live dispatch per order" partial unique index to also exclude
-- DELIVERY_FAILED. A DELIVERY_FAILED dispatch is terminal — the order must be
-- free for a new dispatch after a failed attempt.
DROP INDEX IF EXISTS "dispatches_one_live_per_order";
CREATE UNIQUE INDEX "dispatches_one_live_per_order"
  ON "dispatches" ("orderId")
  WHERE "status" NOT IN ('CANCELLED', 'DELIVERED', 'DELIVERY_FAILED');
