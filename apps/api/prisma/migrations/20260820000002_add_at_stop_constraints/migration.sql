-- Phase 5A (2/2) — update the double-booking GiST constraints to include AT_STOP.
--
-- AT_STOP is a non-terminal status where the driver has stopped at an intermediate
-- point but still holds the cargo (R1). The GiST exclusion constraints that prevent
-- double-booking a driver or vehicle must include AT_STOP in their reserving set.
--
-- PostgreSQL does not support ALTER CONSTRAINT, so the constraints must be dropped
-- and recreated. The enum value was added in migration 20260820000001 and is now
-- committed, so it can be used here without hitting the "unsafe use of new enum
-- value" error (PostgreSQL hint: "New enum values must be committed before they
-- can be used.").
--
-- dispatches_one_live_per_order is NOT touched: AT_STOP is non-terminal, so it
-- already falls outside the exclusion list (CANCELLED / DELIVERED / DELIVERY_FAILED)
-- by the constraint's existing logic.

-- Drop and recreate dispatches_driver_no_overlap with AT_STOP.
ALTER TABLE "dispatches" DROP CONSTRAINT "dispatches_driver_no_overlap";

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
    WHERE ("status" IN ('ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT', 'AT_STOP'));

-- Drop and recreate dispatches_vehicle_no_overlap with AT_STOP.
ALTER TABLE "dispatches" DROP CONSTRAINT "dispatches_vehicle_no_overlap";

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
    WHERE ("status" IN ('ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT', 'AT_STOP'));
