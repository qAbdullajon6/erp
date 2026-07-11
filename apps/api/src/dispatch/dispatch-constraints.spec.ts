import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DISPATCH_CONSTRAINT, translateDispatchWriteError } from "./dispatch-constraints";
import {
  DispatchAssignmentConflictError,
  DispatchNumberConflictError,
  DriverDoubleBookedError,
  VehicleDoubleBookedError,
} from "./dispatch.errors";

/// The error shapes below are not invented: they are what Postgres + Prisma
/// actually produce for the constraints added in Task 8.2, confirmed by
/// provoking each violation against a real database. The important asymmetry —
/// and the reason this translator exists — is that Prisma maps a unique-index
/// violation to a structured P2002 but does NOT map an exclusion violation at
/// all: 23P01 arrives as an *unknown* request error with no code and no meta, so
/// the constraint name embedded in the message is the only handle we get.
/// test/dispatch-transactions.e2e-spec.ts proves the real database still hands
/// us these shapes.

function exclusionViolation(constraint: string): Prisma.PrismaClientUnknownRequestError {
  return new Prisma.PrismaClientUnknownRequestError(
    `Invalid \`prisma.dispatch.create()\` invocation:\n\nError occurred during query execution:\nConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23P01", message: "conflicting key value violates exclusion constraint \\"${constraint}\\"", severity: "ERROR", detail: Some("Key (...)=(...) conflicts with existing key (...)."), column: None, hint: None }), transient: false })`,
    { clientVersion: "6.0.0" },
  );
}

function uniqueViolation(modelName: string, target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.0.0",
    meta: { modelName, target },
  });
}

describe("translateDispatchWriteError", () => {
  describe("R5 — overlap exclusion constraints (23P01)", () => {
    it("maps a driver overlap to a driver double-booking conflict", () => {
      expect(() =>
        translateDispatchWriteError(exclusionViolation(DISPATCH_CONSTRAINT.DRIVER_OVERLAP)),
      ).toThrow(DriverDoubleBookedError);
    });

    it("maps a vehicle overlap to a vehicle double-booking conflict", () => {
      expect(() =>
        translateDispatchWriteError(exclusionViolation(DISPATCH_CONSTRAINT.VEHICLE_OVERLAP)),
      ).toThrow(VehicleDoubleBookedError);
    });

    it("distinguishes the two by constraint NAME, not by the resource word in the message", () => {
      // Both messages mention neither "driver" nor "vehicle" in prose here — only
      // the constraint name differs. If the translator were string-matching the
      // SQL text it would have nothing to go on.
      const error = translateCaught(exclusionViolation(DISPATCH_CONSTRAINT.VEHICLE_OVERLAP));
      expect(error).toBeInstanceOf(VehicleDoubleBookedError);
      expect(error).not.toBeInstanceOf(DriverDoubleBookedError);
    });
  });

  describe("R9 — one open assignment per dispatch (P2002)", () => {
    it("maps the partial-unique violation to an assignment conflict", () => {
      // Note the target names the FIELD (dispatchId), not the index — which is
      // exactly why this branch keys off the model + field and not the name in
      // DISPATCH_CONSTRAINT.ONE_OPEN_ASSIGNMENT.
      expect(() =>
        translateDispatchWriteError(uniqueViolation("DispatchAssignment", ["dispatchId"])),
      ).toThrow(DispatchAssignmentConflictError);
    });
  });

  it("maps a dispatch-number collision to a retryable conflict", () => {
    expect(() =>
      translateDispatchWriteError(uniqueViolation("Dispatch", ["organizationId", "dispatchNumber"])),
    ).toThrow(DispatchNumberConflictError);
  });

  describe("every translated error is a 409, never a 500", () => {
    it.each([
      exclusionViolation(DISPATCH_CONSTRAINT.DRIVER_OVERLAP),
      exclusionViolation(DISPATCH_CONSTRAINT.VEHICLE_OVERLAP),
      uniqueViolation("DispatchAssignment", ["dispatchId"]),
      uniqueViolation("Dispatch", ["organizationId", "dispatchNumber"]),
    ])("case %#", (violation) => {
      const error = translateCaught(violation);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getStatus()).toBe(409);
    });
  });

  describe("errors it does not recognise pass through untouched", () => {
    it("rethrows an unrelated exclusion constraint rather than guessing", () => {
      const unrelated = exclusionViolation("some_other_table_no_overlap");
      expect(() => translateDispatchWriteError(unrelated)).toThrow(
        Prisma.PrismaClientUnknownRequestError,
      );
    });

    it("rethrows a P2002 on a model this translator knows nothing about", () => {
      const unrelated = uniqueViolation("Customer", ["customerCode"]);
      expect(() => translateDispatchWriteError(unrelated)).toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
    });

    it("rethrows a P2002 on Dispatch for a field other than dispatchNumber", () => {
      const unrelated = uniqueViolation("Dispatch", ["id"]);
      expect(() => translateDispatchWriteError(unrelated)).toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
    });

    it("rethrows a domain error raised inside the transaction unchanged", () => {
      // The service throws NotFound/Conflict from inside the tx callback (a lost
      // compare-and-set race). Those must survive the translator untouched.
      const domain = new ConflictException("Cannot transition a dispatch from DELIVERED to CANCELLED");
      expect(translateCaught(domain)).toBe(domain);
    });

    it("rethrows a plain programming error, so a real bug still surfaces as a 500", () => {
      const bug = new TypeError("cannot read properties of undefined");
      expect(translateCaught(bug)).toBe(bug);
    });
  });
});

/// translateDispatchWriteError always throws; this hands back what it threw.
function translateCaught(input: unknown): unknown {
  try {
    translateDispatchWriteError(input);
  } catch (error) {
    return error;
  }
  throw new Error("translateDispatchWriteError returned instead of throwing");
}
