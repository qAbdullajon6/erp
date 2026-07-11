-- ADR-001 Phase 1 (Task 8.2) — database invariants for dispatch. Implements
-- R1 (which statuses reserve), R5 (double-booking impossible), R9 (append-only
-- reassignment history). Additive only: no column is dropped or altered, no row
-- is written, and Order.driverId / Order.vehicleId are left exactly as they are.
--
-- Two invariants are enforced here rather than in the application, because an
-- application check is a check-then-write: two concurrent transactions both pass
-- it and both commit. The database is the guarantee; the service-side check
-- (Task 8.4) exists only to produce a friendly error before we get here.

-- ---------------------------------------------------------------------------
-- 1. dispatch_assignments — append-only assignment history (R9)
-- ---------------------------------------------------------------------------

-- CreateTable dispatch_assignments
CREATE TABLE "dispatch_assignments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMP(3),
    "changedByUserId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatch_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dispatch_assignments_organizationId_idx" ON "dispatch_assignments"("organizationId");

-- CreateIndex
CREATE INDEX "dispatch_assignments_dispatchId_idx" ON "dispatch_assignments"("dispatchId");

-- CreateIndex
CREATE INDEX "dispatch_assignments_driverId_idx" ON "dispatch_assignments"("driverId");

-- CreateIndex
CREATE INDEX "dispatch_assignments_vehicleId_idx" ON "dispatch_assignments"("vehicleId");

-- AddForeignKey
ALTER TABLE "dispatch_assignments" ADD CONSTRAINT "dispatch_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_assignments" ADD CONSTRAINT "dispatch_assignments_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_assignments" ADD CONSTRAINT "dispatch_assignments_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_assignments" ADD CONSTRAINT "dispatch_assignments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_assignments" ADD CONSTRAINT "dispatch_assignments_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- R9: a dispatch has at most ONE open assignment. This is what makes
-- "close the previous row, then open a new one" the only legal way to reassign
-- — an UPDATE that overwrote the open row would still satisfy this, but an
-- INSERT of a second open row cannot. Partial, so closed history rows are
-- unconstrained. Not expressible as @@unique in Prisma's DSL.
CREATE UNIQUE INDEX "dispatch_assignments_one_open_per_dispatch"
    ON "dispatch_assignments" ("dispatchId")
    WHERE "unassignedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Double-booking becomes impossible (R1 + R5)
-- ---------------------------------------------------------------------------
-- R5 is a RANGE-OVERLAP rule, not an equality rule, so a unique index cannot
-- express it: we need "same org AND same driver AND overlapping window". That
-- is a GiST exclusion constraint. btree_gist supplies the GiST operator classes
-- for equality on the text (uuid) columns; it is a trusted extension from
-- PostgreSQL 13 on, so the database owner can create it without superuser.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- The window columns are `timestamp without time zone` (Prisma's DateTime maps
-- to TIMESTAMP(3)), so the range type is tsrange — NOT tstzrange.
--
-- Bounds are INCLUSIVE '[]' on purpose: it reproduces the exact predicate the
-- application already uses (`existing.pickup <= candidate.delivery AND
-- existing.delivery >= candidate.pickup`), under which two trips that merely
-- touch at an endpoint do conflict. Changing that would be a behaviour change,
-- which is out of scope for this task.
--
-- LEAST/GREATEST normalise the window. Nothing today forbids a dispatch whose
-- delivery precedes its pickup (there is no CHECK on the columns), and
-- tsrange() raises a hard error on an inverted range. Normalising keeps such a
-- row checkable instead of crashing the INSERT with a raw range error, and adds
-- no new rejection — adding a `pickup <= delivery` CHECK would be a behaviour
-- change, so it is deliberately left to Task 8.3. Both functions are IMMUTABLE,
-- which an exclusion constraint requires.
--
-- The WHERE clause is R1: only ASSIGNED / EN_ROUTE_TO_PICKUP / AT_PICKUP /
-- IN_TRANSIT reserve a driver or vehicle. DRAFT is an unreserved plan, and
-- DELIVERED / CANCELLED have released the resource — so those rows are outside
-- the constraint entirely and can overlap freely.

ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_driver_no_overlap"
    EXCLUDE USING gist (
        "organizationId" WITH =,
        "driverId" WITH =,
        tsrange(
            LEAST("pickupDateScheduled", "deliveryDateScheduled"),
            GREATEST("pickupDateScheduled", "deliveryDateScheduled"),
            '[]'
        ) WITH &&
    )
    WHERE ("status" IN ('ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT'));

ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_vehicle_no_overlap"
    EXCLUDE USING gist (
        "organizationId" WITH =,
        "vehicleId" WITH =,
        tsrange(
            LEAST("pickupDateScheduled", "deliveryDateScheduled"),
            GREATEST("pickupDateScheduled", "deliveryDateScheduled"),
            '[]'
        ) WITH &&
    )
    WHERE ("status" IN ('ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT'));
