import { DispatchStatus } from "@prisma/client";
import {
  ALLOWED_TRANSITIONS,
  allowedDispatchTransitions,
  DISPATCH_PROGRESS,
  DISPATCH_SEQUENCE,
  DRIVER_DISPATCH_STATUSES,
} from "./dispatch-transitions";

/// R13 lives in one place (TD-011). These tests pin the DERIVED tables against the
/// values they had when they were written out by hand — so the derivation cannot
/// silently change the rules it replaced.

describe("ALLOWED_TRANSITIONS is derived, and identical to the table it replaced", () => {
  it("reproduces the hand-written table exactly", () => {
    expect(ALLOWED_TRANSITIONS).toEqual({
      DRAFT: ["ASSIGNED"],
      ASSIGNED: ["EN_ROUTE_TO_PICKUP", "CANCELLED"],
      EN_ROUTE_TO_PICKUP: ["AT_PICKUP", "CANCELLED"],
      AT_PICKUP: ["IN_TRANSIT", "CANCELLED"],
      IN_TRANSIT: ["DELIVERED", "CANCELLED"],
      DELIVERED: [],
      CANCELLED: [],
    });
  });

  it("a DRAFT cannot be cancelled through the status endpoint — deliberately", () => {
    // Not an oversight of the derivation: it is what has always shipped. The
    // dedicated /cancel endpoint IS more permissive. Recorded in TECHNICAL_DEBT.md.
    expect(ALLOWED_TRANSITIONS.DRAFT).not.toContain("CANCELLED");
  });

  it("every state steps to the one after it in the chain, and no further", () => {
    for (const [index, status] of DISPATCH_SEQUENCE.entries()) {
      const next = DISPATCH_SEQUENCE[index + 1];
      const forward = ALLOWED_TRANSITIONS[status].filter((s) => s !== "CANCELLED");
      expect(forward).toEqual(next ? [next] : []);
    }
  });
});

describe("DISPATCH_PROGRESS", () => {
  it("ranks the chain in order, with CANCELLED below everything", () => {
    expect(DISPATCH_PROGRESS).toEqual({
      CANCELLED: 0,
      DRAFT: 1,
      ASSIGNED: 2,
      EN_ROUTE_TO_PICKUP: 3,
      AT_PICKUP: 4,
      IN_TRANSIT: 5,
      DELIVERED: 6,
    });
  });

  it("a live dispatch always outranks a cancelled one (R2)", () => {
    for (const status of DISPATCH_SEQUENCE) {
      expect(DISPATCH_PROGRESS[status]).toBeGreaterThan(DISPATCH_PROGRESS.CANCELLED);
    }
  });
});

describe("the driver-safe subset", () => {
  it("never lets a driver activate or cancel", () => {
    expect(DRIVER_DISPATCH_STATUSES).not.toContain("ASSIGNED");
    expect(DRIVER_DISPATCH_STATUSES).not.toContain("CANCELLED");
  });

  it("narrows from the same table rather than restating it", () => {
    expect(allowedDispatchTransitions("ASSIGNED")).toEqual(["EN_ROUTE_TO_PICKUP", "CANCELLED"]);
    expect(allowedDispatchTransitions("ASSIGNED", DRIVER_DISPATCH_STATUSES)).toEqual([
      "EN_ROUTE_TO_PICKUP",
    ]);
  });

  it("offers a driver nothing on a terminal dispatch", () => {
    for (const status of ["DELIVERED", "CANCELLED"] as DispatchStatus[]) {
      expect(allowedDispatchTransitions(status, DRIVER_DISPATCH_STATUSES)).toEqual([]);
    }
  });
});
