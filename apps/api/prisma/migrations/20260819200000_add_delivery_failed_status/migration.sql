-- AlterEnum: add DELIVERY_FAILED to the dispatch status progression.
ALTER TYPE "DispatchStatus" ADD VALUE 'DELIVERY_FAILED';

-- CreateEnum: structured reasons a driver reports for a failed delivery.
CREATE TYPE "DeliveryFailureReason" AS ENUM (
  'CUSTOMER_UNAVAILABLE',
  'CUSTOMER_REFUSED',
  'WRONG_ADDRESS',
  'ACCESS_PROBLEM',
  'DAMAGED_CARGO',
  'VEHICLE_PROBLEM',
  'OTHER'
);
