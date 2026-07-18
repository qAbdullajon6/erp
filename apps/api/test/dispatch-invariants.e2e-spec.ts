import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";

/// Database-invariant verification for ADR-001 Phase 1 (Task 8.2).
///
/// This is a MIGRATION test, not a service or API test: it talks to Postgres
/// through PrismaClient and asserts that the constraints added by
/// 20260711120000_add_dispatch_assignment_and_overlap_constraints hold even when
/// the application layer is bypassed entirely. That is the whole point —
/// R5 says the database is the guarantee, not the app check, so the only honest
/// way to prove it is to try to write the bad row directly.
///
/// Rules covered: R1 (which statuses reserve), R5 (no double-booking), R9
/// (append-only reassignment), R14 (tenant scoping of the constraint).
const prisma = new PrismaClient();

const DRIVER_OVERLAP = "dispatches_driver_no_overlap";
const VEHICLE_OVERLAP = "dispatches_vehicle_no_overlap";
// (the one-open-assignment index surfaces as Prisma P2002 — see the R9 test)

/// The trip window every dispatch in this suite is scheduled into.
const PICKUP = new Date("2031-03-01T08:00:00.000Z");
const DELIVERY = new Date("2031-03-03T18:00:00.000Z");

interface Fixture {
  organizationId: string;
  orderId: string;
  driverA: string;
  driverB: string;
  vehicleA: string;
  vehicleB: string;
}

async function seedOrganization(name: string): Promise<Fixture> {
  const organization = await prisma.organization.create({
    data: { name, slug: `${name.toLowerCase().replace(/\s+/g, "-")}-${randomUUID()}` },
  });
  const organizationId = organization.id;

  const customer = await prisma.customer.create({
    data: {
      organizationId,
      customerCode: `CUS-${randomUUID().slice(0, 8)}`,
      companyName: "Invariant Co",
      contactName: "Ivan Invariant",
    },
  });

  const order = await prisma.order.create({
    data: {
      organizationId,
      orderNumber: `ORD-${randomUUID().slice(0, 8)}`,
      customerId: customer.id,
      pickupAddress: "1 Depot Rd",
      pickupCity: "Tashkent",
      pickupDate: PICKUP,
      deliveryAddress: "9 Dock St",
      deliveryCity: "Samarkand",
      deliveryDate: DELIVERY,
      cargoDescription: "Pallets",
      price: "1000.00",
    },
  });

  const makeDriver = (suffix: string) =>
    prisma.driver.create({
      data: {
        organizationId,
        employeeCode: `DRV-${randomUUID().slice(0, 8)}`,
        firstName: "Driver",
        lastName: suffix,
        phone: "+998 90 000 00 00",
      },
    });
  const makeVehicle = (suffix: string) =>
    prisma.vehicle.create({
      data: {
        organizationId,
        vehicleCode: `VEH-${randomUUID().slice(0, 8)}`,
        plateNumber: `01 ${randomUUID().slice(0, 5)}`,
        type: `Truck ${suffix}`,
      },
    });

  const [driverA, driverB, vehicleA, vehicleB] = await Promise.all([
    makeDriver("A"),
    makeDriver("B"),
    makeVehicle("A"),
    makeVehicle("B"),
  ]);

  return {
    organizationId,
    orderId: order.id,
    driverA: driverA.id,
    driverB: driverB.id,
    vehicleA: vehicleA.id,
    vehicleB: vehicleB.id,
  };
}

/// Writes straight through Prisma — no service, no policy, no validation.
function createDispatch(
  fixture: Fixture,
  overrides: {
    driverId?: string;
    vehicleId?: string;
    status?: "DRAFT" | "ASSIGNED" | "EN_ROUTE_TO_PICKUP" | "AT_PICKUP" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED";
    pickup?: Date;
    delivery?: Date;
  } = {},
) {
  return prisma.dispatch.create({
    data: {
      organizationId: fixture.organizationId,
      dispatchNumber: `DSP-${randomUUID().slice(0, 8)}`,
      orderId: fixture.orderId,
      driverId: overrides.driverId ?? fixture.driverA,
      vehicleId: overrides.vehicleId ?? fixture.vehicleA,
      status: overrides.status ?? "ASSIGNED",
      pickupDateScheduled: overrides.pickup ?? PICKUP,
      deliveryDateScheduled: overrides.delivery ?? DELIVERY,
    },
  });
}

describe("dispatch database invariants (ADR-001 Phase 1)", () => {
  let org: Fixture;
  let otherOrg: Fixture;
  const organizationIds: string[] = [];

  beforeAll(async () => {
    org = await seedOrganization("Invariant Org");
    otherOrg = await seedOrganization("Other Org");
    organizationIds.push(org.organizationId, otherOrg.organizationId);
  });

  afterEach(async () => {
    // Each test starts from "no dispatches", so the constraints are exercised
    // in isolation. Assignments cascade with their dispatch.
    await prisma.dispatch.deleteMany({ where: { organizationId: { in: organizationIds } } });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.$disconnect();
  });

  describe("R5 — double-booking is impossible at the database level", () => {
    it("rejects a second ACTIVE dispatch for the same driver in an overlapping window", async () => {
      await createDispatch(org, { driverId: org.driverA, vehicleId: org.vehicleA });

      await expect(
        // Same driver, a different vehicle, same window.
        createDispatch(org, { driverId: org.driverA, vehicleId: org.vehicleB }),
      ).rejects.toThrow(DRIVER_OVERLAP);
    });

    it("rejects a second ACTIVE dispatch for the same vehicle in an overlapping window", async () => {
      await createDispatch(org, { driverId: org.driverA, vehicleId: org.vehicleA });

      await expect(
        // Same vehicle, a different driver, same window.
        createDispatch(org, { driverId: org.driverB, vehicleId: org.vehicleA }),
      ).rejects.toThrow(VEHICLE_OVERLAP);
    });

    it("rejects windows that merely touch at an endpoint (bounds are inclusive)", async () => {
      await createDispatch(org, { pickup: PICKUP, delivery: DELIVERY });

      await expect(
        createDispatch(org, {
          vehicleId: org.vehicleB,
          // Starts exactly when the other ends — the app's predicate treats this
          // as a conflict, and so must the constraint.
          pickup: DELIVERY,
          delivery: new Date("2031-03-05T18:00:00.000Z"),
        }),
      ).rejects.toThrow(DRIVER_OVERLAP);
    });

    it("allows the same driver and vehicle in a NON-overlapping window", async () => {
      await createDispatch(org);

      await expect(
        createDispatch(org, {
          pickup: new Date("2031-03-04T08:00:00.000Z"),
          delivery: new Date("2031-03-06T18:00:00.000Z"),
        }),
      ).resolves.toBeDefined();
    });

    it("re-assigning a driver onto a conflicting dispatch is rejected on UPDATE too", async () => {
      await createDispatch(org, { driverId: org.driverA, vehicleId: org.vehicleA });
      const second = await createDispatch(org, { driverId: org.driverB, vehicleId: org.vehicleB });

      await expect(
        prisma.dispatch.update({ where: { id: second.id }, data: { driverId: org.driverA } }),
      ).rejects.toThrow(DRIVER_OVERLAP);
    });
  });

  describe("R1 — only ACTIVE statuses reserve", () => {
    it("lets a DRAFT dispatch overlap an ACTIVE one (a draft reserves nothing)", async () => {
      await createDispatch(org, { status: "ASSIGNED" });

      await expect(createDispatch(org, { status: "DRAFT" })).resolves.toBeDefined();
    });

    it.each(["DELIVERED", "CANCELLED"] as const)(
      "lets a new ACTIVE dispatch reuse the resources of a %s one (terminal releases)",
      async (terminal) => {
        await createDispatch(org, { status: terminal });

        await expect(createDispatch(org, { status: "ASSIGNED" })).resolves.toBeDefined();
      },
    );

    it.each(["EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT"] as const)(
      "treats %s as reserving, exactly like ASSIGNED",
      async (status) => {
        await createDispatch(org, { status });

        await expect(createDispatch(org, { status: "ASSIGNED" })).rejects.toThrow(DRIVER_OVERLAP);
      },
    );
  });

  describe("R14 — the constraint is tenant-scoped", () => {
    it("allows another organization's dispatch in the same window (different driver rows)", async () => {
      await createDispatch(org);

      // A different tenant, its own driver/vehicle, identical window.
      await expect(createDispatch(otherOrg)).resolves.toBeDefined();
    });
  });

  describe("R9 — reassignment history is append-only", () => {
    it("permits at most one OPEN assignment per dispatch", async () => {
      const dispatch = await createDispatch(org);
      const base = {
        organizationId: org.organizationId,
        dispatchId: dispatch.id,
        driverId: org.driverA,
        vehicleId: org.vehicleA,
      };

      await prisma.dispatchAssignment.create({ data: base });

      await expect(
        // A second row with unassignedAt = NULL would mean two current drivers.
        prisma.dispatchAssignment.create({
          data: { ...base, driverId: org.driverB, vehicleId: org.vehicleB },
        }),
        // Prisma maps a unique-index violation (23505) to P2002 and names the
        // FIELD, not the index — unlike the exclusion constraints (23P01), which
        // it does not map, so those surface their constraint name verbatim.
      ).rejects.toMatchObject({ code: "P2002" });
    });

    it("permits a new assignment once the previous one is closed", async () => {
      const dispatch = await createDispatch(org);
      const base = {
        organizationId: org.organizationId,
        dispatchId: dispatch.id,
        driverId: org.driverA,
        vehicleId: org.vehicleA,
      };

      const first = await prisma.dispatchAssignment.create({ data: base });
      await prisma.dispatchAssignment.update({
        where: { id: first.id },
        data: { unassignedAt: new Date(), reason: "Driver called in sick" },
      });

      await expect(
        prisma.dispatchAssignment.create({
          data: { ...base, driverId: org.driverB, vehicleId: org.vehicleB },
        }),
      ).resolves.toBeDefined();

      // The closed row survives: history is never overwritten.
      const history = await prisma.dispatchAssignment.findMany({
        where: { dispatchId: dispatch.id },
      });
      expect(history).toHaveLength(2);
      expect(history.filter((row) => row.unassignedAt === null)).toHaveLength(1);
    });

    it("keeps many closed assignments for one dispatch", async () => {
      const dispatch = await createDispatch(org);
      const base = {
        organizationId: org.organizationId,
        dispatchId: dispatch.id,
        driverId: org.driverA,
        vehicleId: org.vehicleA,
        unassignedAt: new Date(),
      };

      await prisma.dispatchAssignment.create({ data: base });
      await expect(prisma.dispatchAssignment.create({ data: base })).resolves.toBeDefined();
    });
  });
});
