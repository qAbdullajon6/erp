import { Prisma } from "@prisma/client";
import {
  DispatchAssignmentConflictError,
  DispatchNumberConflictError,
  DriverDoubleBookedError,
  VehicleDoubleBookedError,
} from "./dispatch.errors";

/// The database constraints added by
/// 20260711120000_add_dispatch_assignment_and_overlap_constraints. These names
/// are the contract between the migration and this translator: we key off the
/// constraint NAME, never off the human-readable SQL prose around it. If the
/// migration renames one, this file is the single place that must follow.
export const DISPATCH_CONSTRAINT = {
  /// R5 — GiST EXCLUDE on (organizationId, driverId, scheduled window).
  DRIVER_OVERLAP: "dispatches_driver_no_overlap",
  /// R5 — the same, on vehicleId.
  VEHICLE_OVERLAP: "dispatches_vehicle_no_overlap",
  /// R9 — partial unique on dispatch_assignments(dispatchId) WHERE unassignedAt IS NULL.
  ONE_OPEN_ASSIGNMENT: "dispatch_assignments_one_open_per_dispatch",
} as const;

/// Postgres raises 23P01 for an exclusion-constraint violation, and Prisma does
/// NOT map that code: it arrives as a PrismaClientUnknownRequestError with no
/// `code` and no `meta`, so the constraint name carried in the message is the
/// only identifier available. We therefore look for our own constant — not for
/// any particular wording of the surrounding error text.
function isExclusionViolation(error: unknown, constraint: string): boolean {
  return (
    error instanceof Prisma.PrismaClientUnknownRequestError && error.message.includes(constraint)
  );
}

/// A unique-index violation, by contrast, IS mapped: P2002, with the model and
/// the offending field(s) in `meta` — so this one needs no message inspection.
function isUniqueViolation(error: unknown, modelName: string, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const meta = error.meta as { modelName?: string; target?: unknown } | undefined;
  if (meta?.modelName !== modelName) return false;
  return Array.isArray(meta.target) && meta.target.includes(field);
}

/// Translates a database constraint failure into a dispatch domain error, or
/// rethrows anything it does not recognise unchanged (so a genuine bug still
/// surfaces as a 500 rather than being disguised as a conflict).
///
/// Declared `never` so callers can use it as the whole body of a catch block and
/// TypeScript understands control flow does not continue past it.
export function translateDispatchWriteError(error: unknown): never {
  if (isExclusionViolation(error, DISPATCH_CONSTRAINT.DRIVER_OVERLAP)) {
    throw new DriverDoubleBookedError();
  }
  if (isExclusionViolation(error, DISPATCH_CONSTRAINT.VEHICLE_OVERLAP)) {
    throw new VehicleDoubleBookedError();
  }
  if (isUniqueViolation(error, "DispatchAssignment", "dispatchId")) {
    throw new DispatchAssignmentConflictError();
  }
  if (isUniqueViolation(error, "Dispatch", "dispatchNumber")) {
    throw new DispatchNumberConflictError();
  }
  throw error;
}
