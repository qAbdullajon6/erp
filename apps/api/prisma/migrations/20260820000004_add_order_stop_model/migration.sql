-- Phase 5D-1 — OrderStop: planned intermediate stops on an order.
--
-- Introduces the order_stops table, which records the dispatcher's intended
-- intermediate stop plan for an order. These rows are the source of truth for
-- the route plan; DispatchStop rows created by createStopSnapshots() are
-- immutable execution snapshots of this plan captured at dispatch creation time.
--
-- stopIndex is 1-based and covers intermediate stops ONLY (1, 2, 3, ...).
-- Pickup (index 0) and delivery (last index) remain on the Order itself.
--
-- Existing orders with zero order_stops rows continue to produce exactly two
-- dispatch stops (PICKUP + DELIVERY) — backward compatible with all prior data.

-- CreateTable
CREATE TABLE "order_stops" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId"        TEXT NOT NULL,
    "stopIndex"      INTEGER NOT NULL,
    "address"        TEXT NOT NULL,
    "city"           TEXT NOT NULL,
    "postalCode"     TEXT,
    "countryCode"    TEXT,
    "placeName"      TEXT,
    "lat"            DECIMAL(10,7),
    "lng"            DECIMAL(10,7),
    "contactName"    TEXT,
    "contactPhone"   TEXT,
    "instructions"   TEXT,
    "windowStart"    TIMESTAMP(3),
    "windowEnd"      TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_stops_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "order_stops"
    ADD CONSTRAINT "order_stops_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_stops"
    ADD CONSTRAINT "order_stops_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
-- Unique constraint: two intermediate stops at the same index on the same order
-- are physically impossible (same role as dispatch_stops_dispatchId_stopIndex_key).
CREATE UNIQUE INDEX "order_stops_orderId_stopIndex_key"
    ON "order_stops"("orderId", "stopIndex");

CREATE INDEX "order_stops_organizationId_orderId_idx"
    ON "order_stops"("organizationId", "orderId");
