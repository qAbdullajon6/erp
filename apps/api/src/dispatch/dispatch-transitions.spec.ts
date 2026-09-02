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
      // IN_TRANSIT has two forward paths: AT_STOP (optional stop) and
      // ARRIVED_AT_DELIVERY (direct, most dispatches take this).
      IN_TRANSIT: ["AT_STOP", "CANCELLED", "ARRIVED_AT_DELIVERY"],
      AT_STOP: ["ARRIVED_AT_DELIVERY", "CANCELLED", "IN_TRANSIT"],
      ARRIVED_AT_DELIVERY: ["DELIVERED", "CANCELLED", "DELIVERY_FAILED"],
      DELIVERED: [],
      CANCELLED: [],
      DELIVERY_FAILED: [],
    });
  });

  it("a DRAFT cannot be cancelled through the status endpoint — deliberately", () => {
    // Not an oversight of the derivation: it is what has always shipped. The
    // dedicated /cancel endpoint IS more permissive. Recorded in TECHNICAL_DEBT.md.
    expect(ALLOWED_TRANSITIONS.DRAFT).not.toContain("CANCELLED");
  });

  it("every state includes the next chain step in its forward transitions", () => {
    for (const [index, status] of DISPATCH_SEQUENCE.entries()) {
      const next = DISPATCH_SEQUENCE[index + 1];
      if (!next) {
        // DELIVERED is terminal.
        expect(ALLOWED_TRANSITIONS[status]).toEqual([]);
      } else {
        // Each state must include the next step in the chain.
        // Extra transitions (shortcuts, loopbacks, side-exits) are allowed.
        expect(ALLOWED_TRANSITIONS[status]).toContain(next);
      }
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
      AT_STOP: 6,
      ARRIVED_AT_DELIVERY: 7,
      DELIVERED: 8,
      DELIVERY_FAILED: 7,
    });
  });

  it("a live dispatch always outranks a cancelled one (R2)", () => {
    for (const status of DISPATCH_SEQUENCE) {
      expect(DISPATCH_PROGRESS[status]).toBeGreaterThan(DISPATCH_PROGRESS.CANCELLED);
    }
  });
});

describe("DELIVERY_FAILED transition rules", () => {
  it("is reachable from ARRIVED_AT_DELIVERY only", () => {
    expect(ALLOWED_TRANSITIONS.ARRIVED_AT_DELIVERY).toContain("DELIVERY_FAILED");
    for (const [status, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      if (status === "ARRIVED_AT_DELIVERY") continue;
      expect(targets).not.toContain("DELIVERY_FAILED");
    }
  });

  it("is terminal — no outbound transitions", () => {
    expect(ALLOWED_TRANSITIONS.DELIVERY_FAILED).toEqual([]);
  });

  it("ranks equal to ARRIVED_AT_DELIVERY in DISPATCH_PROGRESS", () => {
    // DELIVERY_FAILED is reached FROM ARRIVED_AT_DELIVERY, representing the same
    // physical position with a failed outcome. AT_STOP must NOT be used as the
    // anchor — DELIVERY_FAILED aligns with the delivery attempt, not a mid-stop.
    expect(DISPATCH_PROGRESS.DELIVERY_FAILED).toBe(DISPATCH_PROGRESS.ARRIVED_AT_DELIVERY);
  });

  it("ranks above CANCELLED in DISPATCH_PROGRESS", () => {
    expect(DISPATCH_PROGRESS.DELIVERY_FAILED).toBeGreaterThan(DISPATCH_PROGRESS.CANCELLED);
  });
});

describe("AT_STOP transition rules", () => {
  it("is reachable from IN_TRANSIT only (forward step)", () => {
    expect(ALLOWED_TRANSITIONS.IN_TRANSIT).toContain("AT_STOP");
    for (const [status, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      if (status === "IN_TRANSIT") continue;
      expect(targets).not.toContain("AT_STOP");
    }
  });

  it("allows loopback to IN_TRANSIT (driver resumes after a stop)", () => {
    expect(ALLOWED_TRANSITIONS.AT_STOP).toContain("IN_TRANSIT");
  });

  it("allows forward step to ARRIVED_AT_DELIVERY", () => {
    expect(ALLOWED_TRANSITIONS.AT_STOP).toContain("ARRIVED_AT_DELIVERY");
  });

  it("ranks above IN_TRANSIT and below ARRIVED_AT_DELIVERY in DISPATCH_PROGRESS", () => {
    expect(DISPATCH_PROGRESS.AT_STOP).toBeGreaterThan(DISPATCH_PROGRESS.IN_TRANSIT);
    expect(DISPATCH_PROGRESS.AT_STOP).toBeLessThan(DISPATCH_PROGRESS.ARRIVED_AT_DELIVERY);
  });

  it("IN_TRANSIT also keeps a direct path to ARRIVED_AT_DELIVERY (AT_STOP is optional)", () => {
    // Most dispatches never stop — they go IN_TRANSIT -> ARRIVED_AT_DELIVERY directly.
    // AT_STOP is an optional detour, not a mandatory gate.
    expect(ALLOWED_TRANSITIONS.IN_TRANSIT).toContain("ARRIVED_AT_DELIVERY");
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
    for (const status of ["DELIVERED", "CANCELLED", "DELIVERY_FAILED"] as DispatchStatus[]) {
      expect(allowedDispatchTransitions(status, DRIVER_DISPATCH_STATUSES)).toEqual([]);
    }
  });
});
