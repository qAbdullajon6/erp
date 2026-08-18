import { Prisma } from "@prisma/client";
import { describe, expect, it } from "@jest/globals";
import { detectDispatchConflicts, type DispatchConflictContext } from "./dispatch-conflict.engine";

function baseDispatch(overrides: Partial<DispatchConflictContext> = {}): DispatchConflictContext {
  const now = new Date("2026-07-29T12:00:00.000Z");
  return {
    id: "dispatch-1",
    organizationId: "org-1",
    dispatchNumber: "DSP-001",
    orderId: "order-1",
    driverId: "driver-1",
    vehicleId: "vehicle-1",
    createdByUserId: null,
    status: "ASSIGNED",
    pickupDateScheduled: new Date("2026-07-29T14:00:00.000Z"),
    pickupDateActual: null,
    deliveryDateScheduled: new Date("2026-07-29T18:00:00.000Z"),
    deliveryDateActual: null,
    notes: null,
    driverAcceptanceStatus: "PENDING",
    driverAcceptedAt: null,
    driverRejectedAt: null,
    driverRejectReason: null,
    driverRejectNote: null,
    arrivalLat: null,
    arrivalLng: null,
    createdAt: now,
    updatedAt: now,
    driver: {
      id: "driver-1",
      organizationId: "org-1",
      employeeCode: "D1",
      firstName: "Dilnoza",
      lastName: "E.",
      phone: "+1",
      email: null,
      status: "ACTIVE",
      operationalStatus: "AVAILABLE",
      licenseNumber: null,
      licenseExpiry: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      userId: null,
    },
    vehicle: {
      id: "vehicle-1",
      organizationId: "org-1",
      vehicleCode: "V1",
      plateNumber: "01A222BB",
      type: "Truck",
      capacityKg: new Prisma.Decimal(10000),
      capacityM3: new Prisma.Decimal(50),
      status: "AVAILABLE",
      make: null,
      model: null,
      year: null,
      insuranceExpiry: null,
      inspectionExpiry: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    },
    order: {
      id: "order-1",
      organizationId: "org-1",
      orderNumber: "ORD-001",
      customerId: "cust-1",
      pickupAddress: "A",
      pickupCity: "Tashkent",
      pickupDate: new Date("2026-07-29T14:00:00.000Z"),
      deliveryAddress: "B",
      deliveryCity: "Samarkand",
      deliveryDate: new Date("2026-07-29T18:00:00.000Z"),
      cargoDescription: "General",
      cargoWeightKg: new Prisma.Decimal(500),
      cargoVolumeM3: new Prisma.Decimal(2),
      price: new Prisma.Decimal(1000),
      currency: "USD",
      status: "ASSIGNED",
      driverId: "driver-1",
      vehicleId: "vehicle-1",
      notes: null,
      deliveryNotes: null,
      createdAt: now,
      updatedAt: now,
      cancelledAt: null,
      deliveredAt: null,
      archivedAt: null,
      customer: {
        id: "cust-1",
        organizationId: "org-1",
        customerCode: "C1",
        companyName: "Acme",
        contactName: "John",
        email: null,
        phone: null,
        country: null,
        city: null,
        address: null,
        taxId: null,
        paymentTerms: "NET_30",
        creditLimit: new Prisma.Decimal(50000),
        status: "ACTIVE",
        deliveryNotes: null,
        internalNotes: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    },
    ...overrides,
  };
}

describe("detectDispatchConflicts", () => {
  it("detects driver double-booking as critical", () => {
    const conflicts = detectDispatchConflicts({
      dispatch: baseDispatch(),
      reservations: [
        {
          reference: "DSP-999",
          driverId: "driver-1",
          vehicleId: "vehicle-9",
          trip: {
            id: "order-9",
            orderNumber: "ORD-9",
            pickupCity: "A",
            deliveryCity: "B",
            pickupDate: new Date(),
            deliveryDate: new Date(),
            status: "ASSIGNED",
          },
        },
      ],
    });
    expect(conflicts.some((c) => c.type === "driver.assigned" && c.severity === "critical")).toBe(
      true,
    );
  });

  it("detects vehicle maintenance as critical", () => {
    const dispatch = baseDispatch({
      vehicle: {
        ...baseDispatch().vehicle,
        status: "MAINTENANCE",
      },
    });
    const conflicts = detectDispatchConflicts({ dispatch, reservations: [] });
    expect(conflicts.some((c) => c.type === "vehicle.maintenance")).toBe(true);
  });

  it("detects weight capacity conflict", () => {
    const dispatch = baseDispatch({
      order: {
        ...baseDispatch().order,
        cargoWeightKg: new Prisma.Decimal(20000),
      },
    });
    const conflicts = detectDispatchConflicts({ dispatch, reservations: [] });
    expect(conflicts.some((c) => c.type === "capacity.weight")).toBe(true);
  });

  it("detects credit hold when balance exceeds limit", () => {
    const dispatch = baseDispatch({
      order: {
        ...baseDispatch().order,
        customer: {
          ...baseDispatch().order.customer,
          creditLimit: new Prisma.Decimal(1000),
        },
      },
    });
    const conflicts = detectDispatchConflicts({
      dispatch,
      reservations: [],
      customerBalanceDue: new Prisma.Decimal(2500),
    });
    expect(conflicts.some((c) => c.type === "business.credit_hold")).toBe(true);
  });

  it("detects late pickup for active dispatch", () => {
    const dispatch = baseDispatch({
      pickupDateScheduled: new Date("2026-07-29T08:00:00.000Z"),
    });
    const conflicts = detectDispatchConflicts({
      dispatch,
      reservations: [],
      now: new Date("2026-07-29T12:00:00.000Z"),
    });
    expect(conflicts.some((c) => c.type === "schedule.late_pickup")).toBe(true);
  });

  it("formats license expiry as a human-readable date in the description", () => {
    const dispatch = baseDispatch({
      driver: {
        ...baseDispatch().driver,
        licenseExpiry: new Date("2004-05-26T00:00:00.000Z"),
      },
    });
    const conflicts = detectDispatchConflicts({
      dispatch,
      reservations: [],
      now: new Date("2026-07-29T12:00:00.000Z"),
    });
    const license = conflicts.find((c) => c.type === "driver.license_expired");
    expect(license?.description).toContain("May 26, 2004");
    expect(license?.description).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
