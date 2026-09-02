-- Phase 5A (1/2) — add AT_STOP to the DispatchStatus enum.
--
-- AT_STOP sits between IN_TRANSIT and ARRIVED_AT_DELIVERY. The GiST constraint
-- updates that reference the new value are in the next migration (20260820000002)
-- because PostgreSQL requires the new enum value to be committed before it can
-- be used in a WHERE clause of the same session.

ALTER TYPE "DispatchStatus" ADD VALUE 'AT_STOP';
