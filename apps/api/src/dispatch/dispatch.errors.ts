import { BadRequestException, ConflictException } from "@nestjs/common";

/// Dispatch domain errors (ADR-001 R5, R9, R13).
///
/// These are what a LOST RACE looks like. The service still checks overlap
/// optimistically before writing — that check produces the friendly, specific
/// message naming the conflicting dispatch. But the check is a check-then-write:
/// under concurrency two requests both pass it and the database rejects the
/// loser. When that happens the caller must still see a 409 with a sensible
/// message, never a 500 leaking Postgres or Prisma internals.
///
/// They extend ConflictException, so the HTTP status the API already returns for
/// a conflict (409) is unchanged — only the error mapping changes, not the
/// contract.

/// R5 — the driver is already reserved for an overlapping trip.
///
/// AssignmentPolicy throws this too, with `conflictsWith` naming the trip it
/// found. Both the app-side check and the database constraint therefore produce
/// the SAME error type (AR1): the caller cannot tell which one caught it, and
/// there is no second definition of "double-booked" to drift.
export class DriverDoubleBookedError extends ConflictException {
  constructor(conflictsWith?: string) {
    super(doubleBookedMessage("driver", conflictsWith));
  }
}

/// R5 — the vehicle is already reserved for an overlapping trip.
export class VehicleDoubleBookedError extends ConflictException {
  constructor(conflictsWith?: string) {
    super(doubleBookedMessage("vehicle", conflictsWith));
  }
}

/// The database only tells us WHICH constraint failed, never which row it
/// collided with, so the reference is absent when the database is the one
/// rejecting the write.
function doubleBookedMessage(resource: "driver" | "vehicle", conflictsWith?: string): string {
  const target = conflictsWith ? `to ${conflictsWith}` : "elsewhere";
  return `This ${resource} is already assigned ${target} during the requested time range`;
}

/// R12 — a driver must be ACTIVE (and not archived) to take a trip.
export class DriverNotAssignableError extends ConflictException {
  constructor() {
    super("Only active drivers can be assigned");
  }
}

/// R12 — a vehicle must be AVAILABLE (and not archived) to take a trip.
export class VehicleNotAssignableError extends ConflictException {
  constructor() {
    super("Only available vehicles can be assigned");
  }
}

/// The cargo does not fit. A 400 rather than a 409: the request is asking for
/// something that is not merely unavailable but impossible.
export class VehicleCapacityExceededError extends BadRequestException {
  constructor(dimension: "weight" | "volume", cargo: string, capacity: string) {
    const unit = dimension === "weight" ? "kg" : "m3";
    super(
      `Cargo ${dimension} (${cargo}${unit}) exceeds vehicle capacity (${capacity}${unit})`,
    );
  }
}

/// R9 — a dispatch may have only one open assignment. Reassignment must close
/// the previous row before opening a new one; it may never open a second.
export class DispatchAssignmentConflictError extends ConflictException {
  constructor() {
    super("This dispatch already has an open driver/vehicle assignment");
  }
}

/// The dispatch number is allocated by reading the existing numbers and adding
/// one, so two concurrent creates can pick the same one and collide on the
/// unique index. Nothing is wrong with the request — it is safe to retry.
/// (Allocating the number inside the transaction with a retry is left to 8.4.)
export class DispatchNumberConflictError extends ConflictException {
  constructor() {
    super("Could not allocate a dispatch number because another dispatch was created at the same moment. Please try again.");
  }
}
