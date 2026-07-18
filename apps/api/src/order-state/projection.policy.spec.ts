import { DispatchStatus, OrderStatus } from "@prisma/client";
import {
  aggregate,
  DispatchSnapshot,
  OrderSnapshot,
  projectOrderStatus,
} from "./projection.policy";

/// ProjectionPolicy is a pure function, so it is tested as one: no database, no
/// module, no mocks. Every rule in ADR-001 Amendment B is a table row here.

const DELIVERED_AT = new Date("2033-01-05T12:00:00.000Z");

function order(overrides: Partial<OrderSnapshot> = {}): OrderSnapshot {
  return {
    status: "PENDING",
    driverId: null,
    vehicleId: null,
    deliveredAt: null,
    ...overrides,
  };
}

function dispatch(status: DispatchStatus, overrides: Partial<DispatchSnapshot> = {}): DispatchSnapshot {
  return {
    status,
    driverId: "driver-1",
    vehicleId: "vehicle-1",
    deliveryDateActual: null,
    ...overrides,
  };
}

describe("projectOrderStatus — the ADR-001 Amendment B mapping", () => {
  it.each<[DispatchStatus, OrderStatus]>([
    ["ASSIGNED", "ASSIGNED"],
    ["EN_ROUTE_TO_PICKUP", "ASSIGNED"],
    ["AT_PICKUP", "PICKED_UP"],
    ["IN_TRANSIT", "IN_TRANSIT"],
  ])("dispatch %s projects the order to %s", (dispatchStatus, expected) => {
    const result = projectOrderStatus(order({ status: "PENDING" }), [dispatch(dispatchStatus)]);

    expect(result.changed).toBe(true);
    expect(result.status).toBe(expected);
    expect(result.driverId).toBe("driver-1");
    expect(result.vehicleId).toBe("vehicle-1");
  });

  it("copies the dispatch's actual delivery time onto the order when DELIVERED (R7)", () => {
    const result = projectOrderStatus(order({ status: "IN_TRANSIT" }), [
      dispatch("DELIVERED", { deliveryDateActual: DELIVERED_AT }),
    ]);

    expect(result.status).toBe("DELIVERED");
    expect(result.deliveredAt).toEqual(DELIVERED_AT);
  });

  it("keeps the order as it is when there is no dispatch at all", () => {
    const legacy = order({ status: "ASSIGNED", driverId: "d", vehicleId: "v" });

    expect(projectOrderStatus(legacy, [])).toMatchObject({
      changed: false,
      status: "ASSIGNED",
      driverId: "d",
    });
  });

  it("reports no change when the order already agrees with its dispatch (idempotent)", () => {
    const settled = order({ status: "IN_TRANSIT", driverId: "driver-1", vehicleId: "vehicle-1" });

    const result = projectOrderStatus(settled, [dispatch("IN_TRANSIT")]);

    expect(result.changed).toBe(false);
    expect(result.historyToAppend).toEqual([]);
  });
});

describe("a DRAFT dispatch commits nothing (R1, Z3)", () => {
  it("does not move an operational order", () => {
    const result = projectOrderStatus(order({ status: "PENDING" }), [dispatch("DRAFT")]);

    expect(result.changed).toBe(false);
    expect(result.status).toBe("PENDING");
  });

  it("never promotes a DRAFT order to PENDING — that is approval, and only TransitionPolicy may do it", () => {
    // Before Amendment B the table said "Dispatch DRAFT -> Order PENDING", which
    // would have approved an unapproved order as a side effect of a dispatcher
    // sketching a plan.
    const unapproved = order({ status: "DRAFT" });

    const result = projectOrderStatus(unapproved, [dispatch("DRAFT")]);

    expect(result.changed).toBe(false);
    expect(result.status).toBe("DRAFT");
  });

  it("does not drag a DRAFT order into an operational state either", () => {
    const unapproved = order({ status: "DRAFT" });

    const result = projectOrderStatus(unapproved, [dispatch("IN_TRANSIT")]);

    expect(result.changed).toBe(false);
    expect(result.status).toBe("DRAFT");
  });
});

describe("cancellation (R8, Z2)", () => {
  it("releases the order back to PENDING and clears the resources when every dispatch is cancelled", () => {
    const working = order({ status: "IN_TRANSIT", driverId: "driver-1", vehicleId: "vehicle-1" });

    const result = projectOrderStatus(working, [dispatch("CANCELLED")]);

    expect(result.status).toBe("PENDING");
    expect(result.driverId).toBeNull();
    expect(result.vehicleId).toBeNull();
    expect(result.historyToAppend).toEqual(["PENDING"]);
  });

  it("NEVER resurrects a commercially cancelled order", () => {
    // Cancelling an order cancels its dispatch. Without this guard the projection
    // would then read "all dispatches cancelled -> PENDING" and undo the
    // cancellation the customer just made.
    const killed = order({ status: "CANCELLED", driverId: "driver-1", vehicleId: "vehicle-1" });

    const result = projectOrderStatus(killed, [dispatch("CANCELLED")]);

    expect(result.changed).toBe(false);
    expect(result.status).toBe("CANCELLED");
  });

  it("does not let a live dispatch override a commercially cancelled order either", () => {
    const killed = order({ status: "CANCELLED" });

    expect(projectOrderStatus(killed, [dispatch("IN_TRANSIT")])).toMatchObject({
      changed: false,
      status: "CANCELLED",
    });
  });
});

describe("R7 — a delivered order is finished, forever", () => {
  it("does not demote a DELIVERED order when all of its dispatches end up CANCELLED", () => {
    // Without this guard, R8 ("every dispatch cancelled -> release to PENDING")
    // would drag a completed, invoiced delivery back into the unassigned pool and
    // wipe its deliveredAt. The API cannot reach this state, but a data repair can.
    const done = order({
      status: "DELIVERED",
      driverId: "driver-1",
      vehicleId: "vehicle-1",
      deliveredAt: DELIVERED_AT,
    });

    const result = projectOrderStatus(done, [dispatch("CANCELLED")]);

    expect(result.changed).toBe(false);
    expect(result.status).toBe("DELIVERED");
    expect(result.deliveredAt).toEqual(DELIVERED_AT);
  });

  it("still moves an in-flight order INTO delivered — the freeze is on leaving, not arriving", () => {
    const result = projectOrderStatus(order({ status: "IN_TRANSIT", driverId: "driver-1", vehicleId: "vehicle-1" }), [
      dispatch("DELIVERED", { deliveryDateActual: DELIVERED_AT }),
    ]);

    expect(result.changed).toBe(true);
    expect(result.status).toBe("DELIVERED");
  });
});

describe("history (AR2)", () => {
  it("records the single step when the order advances by one", () => {
    const result = projectOrderStatus(order({ status: "ASSIGNED", driverId: "driver-1", vehicleId: "vehicle-1" }), [
      dispatch("AT_PICKUP"),
    ]);

    expect(result.historyToAppend).toEqual(["PICKED_UP"]);
  });

  it("expands a forward jump into every state it crosses, so history never skips one", () => {
    // The order is still ASSIGNED but its dispatch has reached IN_TRANSIT. The
    // order must not record IN_TRANSIT with no PICKED_UP before it.
    const behind = order({ status: "ASSIGNED", driverId: "driver-1", vehicleId: "vehicle-1" });

    const result = projectOrderStatus(behind, [dispatch("IN_TRANSIT")]);

    expect(result.historyToAppend).toEqual(["PICKED_UP", "IN_TRANSIT"]);
  });

  it("records a release as a single row, not a walk backwards through the chain", () => {
    const result = projectOrderStatus(
      order({ status: "IN_TRANSIT", driverId: "driver-1", vehicleId: "vehicle-1" }),
      [dispatch("CANCELLED")],
    );

    expect(result.historyToAppend).toEqual(["PENDING"]);
  });
});

describe("aggregate — N dispatches per order (R2)", () => {
  it("returns nothing for an order with no dispatch", () => {
    expect(aggregate([])).toBeNull();
  });

  it("lets a live dispatch govern over a cancelled one", () => {
    // This is the shape reassignment produces (Task 8.7): the old dispatch is
    // closed, a new one is opened, and the order follows the live one.
    const cancelled = dispatch("CANCELLED", { driverId: "old", vehicleId: "old-v" });
    const live = dispatch("ASSIGNED", { driverId: "new", vehicleId: "new-v" });

    const result = projectOrderStatus(order({ status: "PENDING" }), [cancelled, live]);

    expect(result.status).toBe("ASSIGNED");
    expect(result.driverId).toBe("new");
    expect(result.vehicleId).toBe("new-v");
  });

  it("the furthest-progressed dispatch governs, regardless of the order it is given in", () => {
    const dispatches = [dispatch("ASSIGNED"), dispatch("DELIVERED", { deliveryDateActual: DELIVERED_AT }), dispatch("DRAFT")];

    expect(aggregate(dispatches)?.status).toBe("DELIVERED");
    expect(aggregate([...dispatches].reverse())?.status).toBe("DELIVERED");
  });

  it("only falls back to PENDING when EVERY dispatch is cancelled", () => {
    const result = projectOrderStatus(order({ status: "ASSIGNED", driverId: "driver-1", vehicleId: "vehicle-1" }), [
      dispatch("CANCELLED"),
      dispatch("IN_TRANSIT"),
    ]);

    expect(result.status).toBe("IN_TRANSIT");
  });
});

describe("purity", () => {
  it("does not mutate its inputs", () => {
    const input = order({ status: "PENDING" });
    const dispatches = [dispatch("IN_TRANSIT")];
    const snapshot = JSON.stringify({ input, dispatches });

    projectOrderStatus(input, dispatches);

    expect(JSON.stringify({ input, dispatches })).toBe(snapshot);
  });

  it("is deterministic — the same inputs give the same answer", () => {
    const input = order({ status: "ASSIGNED", driverId: "driver-1", vehicleId: "vehicle-1" });
    const dispatches = [dispatch("AT_PICKUP")];

    expect(projectOrderStatus(input, dispatches)).toEqual(projectOrderStatus(input, dispatches));
  });
});
