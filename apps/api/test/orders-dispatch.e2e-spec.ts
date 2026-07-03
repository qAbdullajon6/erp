import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.config";
import { PrismaService } from "../src/prisma/prisma.service";

interface AuthResultBody {
  data: {
    accessToken: string;
    user: { id: string; email: string };
    organization: { id: string; slug: string };
    membership: { id: string; role: string };
  };
}

interface CustomerBody {
  id: string;
  status: string;
}
interface CustomerResponse {
  data: CustomerBody;
}

interface DriverBody {
  id: string;
}
interface DriverResponse {
  data: DriverBody;
}

interface VehicleBody {
  id: string;
}
interface VehicleResponse {
  data: VehicleBody;
}

interface OrderBody {
  id: string;
  organizationId: string;
  orderNumber: string;
  status: string;
  driverId: string | null;
  vehicleId: string | null;
  isDelayed: boolean;
  price: string;
  statusHistory?: { status: string; note: string | null }[];
}
interface OrderResponse {
  data: OrderBody;
}
interface OrderListResponse {
  data: { items: OrderBody[]; meta: { total: number } };
}
interface ErrorBody {
  error: { statusCode: number; message: string | string[] };
}

function uniqueEmail(): string {
  return `test-${randomUUID()}@example.com`;
}

const FUTURE_PICKUP = "2027-08-01T09:00:00.000Z";
const FUTURE_DELIVERY = "2027-08-05T09:00:00.000Z";

describe("Orders + Dispatch (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdOrganizationIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  async function registerAdmin(organizationName: string) {
    const email = uniqueEmail();
    const res = await request(app.getHttpServer()).post("/auth/register").send({
      email,
      password: "correct-horse-battery",
      firstName: "Org",
      lastName: "Admin",
      organizationName,
    });
    const body = res.body as AuthResultBody;
    createdUserIds.push(body.data.user.id);
    createdOrganizationIds.push(body.data.organization.id);
    return { email, ...body.data };
  }

  async function addMemberWithRole(admin: Awaited<ReturnType<typeof registerAdmin>>, role: string) {
    const memberEmail = uniqueEmail();
    const registerRes = await request(app.getHttpServer()).post("/auth/register").send({
      email: memberEmail,
      password: "correct-horse-battery",
      firstName: "Member",
      lastName: "User",
      organizationName: `Throwaway Org ${randomUUID()}`,
    });
    const memberBody = registerRes.body as AuthResultBody;
    createdUserIds.push(memberBody.data.user.id);
    createdOrganizationIds.push(memberBody.data.organization.id);

    await request(app.getHttpServer())
      .post("/organizations/current/members")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ email: memberEmail, role })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: memberEmail, password: "correct-horse-battery", organizationSlug: admin.organization.slug })
      .expect(200);

    return { email: memberEmail, accessToken: (loginRes.body as AuthResultBody).data.accessToken };
  }

  async function createCustomer(
    admin: Awaited<ReturnType<typeof registerAdmin>>,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post("/customers")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ companyName: "Acme Logistics", contactName: "Jane Doe", ...overrides })
      .expect(201);
    return (res.body as CustomerResponse).data;
  }

  async function createDriver(
    admin: Awaited<ReturnType<typeof registerAdmin>>,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post("/drivers")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ firstName: "Aziz", lastName: "Karimov", phone: "+998901234567", ...overrides })
      .expect(201);
    return (res.body as DriverResponse).data;
  }

  async function createVehicle(
    admin: Awaited<ReturnType<typeof registerAdmin>>,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post("/vehicles")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ plateNumber: "01A123BC", type: "truck", ...overrides })
      .expect(201);
    return (res.body as VehicleResponse).data;
  }

  async function createOrder(
    admin: Awaited<ReturnType<typeof registerAdmin>>,
    customerId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        customerId,
        pickupAddress: "1 Main St",
        pickupCity: "Tashkent",
        pickupDate: FUTURE_PICKUP,
        deliveryAddress: "2 Side St",
        deliveryCity: "Samarkand",
        deliveryDate: FUTURE_DELIVERY,
        cargoDescription: "General freight",
        price: 500,
        ...overrides,
      })
      .expect(201);
    return (res.body as OrderResponse).data;
  }

  async function advanceToPending(admin: Awaited<ReturnType<typeof registerAdmin>>, orderId: string) {
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ status: "PENDING" })
      .expect(200);
  }

  describe("order creation and customer eligibility", () => {
    it("creates an order for an ACTIVE customer with an auto-generated ORD-<year>-#### number, starting DRAFT", async () => {
      const admin = await registerAdmin(`Order Create Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const order = await createOrder(admin, customer.id);
      expect(order.orderNumber).toMatch(/^ORD-\d{4}-\d{4}$/);
      expect(order.status).toBe("DRAFT");
      expect(order.price).toBe("500");
    });

    it("rejects a non-active customer (AT_RISK, INACTIVE, ARCHIVED)", async () => {
      const admin = await registerAdmin(`Order Customer Eligibility Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      await request(app.getHttpServer())
        .patch(`/customers/${customer.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "AT_RISK" })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post("/orders")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          customerId: customer.id,
          pickupAddress: "1 Main St",
          pickupCity: "Tashkent",
          pickupDate: FUTURE_PICKUP,
          deliveryAddress: "2 Side St",
          deliveryCity: "Samarkand",
          deliveryDate: FUTURE_DELIVERY,
          cargoDescription: "General freight",
          price: 500,
        })
        .expect(409);
      expect((res.body as ErrorBody).error.message).toMatch(/active customers/i);
    });

    it("rejects deliveryDate before pickupDate", async () => {
      const admin = await registerAdmin(`Order Date Range Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      await request(app.getHttpServer())
        .post("/orders")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          customerId: customer.id,
          pickupAddress: "1 Main St",
          pickupCity: "Tashkent",
          pickupDate: FUTURE_DELIVERY,
          deliveryAddress: "2 Side St",
          deliveryCity: "Samarkand",
          deliveryDate: FUTURE_PICKUP,
          cargoDescription: "General freight",
          price: 500,
        })
        .expect(400);
    });

    it("there is no permanent delete route", async () => {
      const admin = await registerAdmin(`Order No Delete Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const order = await createOrder(admin, customer.id);
      await request(app.getHttpServer())
        .delete(`/orders/${order.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(404);
    });
  });

  describe("status transitions", () => {
    it("allows the full sequential path DRAFT -> PENDING -> ASSIGNED -> PICKED_UP -> IN_TRANSIT -> DELIVERED", async () => {
      const admin = await registerAdmin(`Status Sequence Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const driver = await createDriver(admin);
      const vehicle = await createVehicle(admin);
      const order = await createOrder(admin, customer.id);

      await advanceToPending(admin, order.id);

      await request(app.getHttpServer())
        .post(`/orders/${order.id}/assign`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ driverId: driver.id, vehicleId: vehicle.id })
        .expect(200);

      for (const status of ["PICKED_UP", "IN_TRANSIT", "DELIVERED"]) {
        const res = await request(app.getHttpServer())
          .post(`/orders/${order.id}/status`)
          .set("Authorization", `Bearer ${admin.accessToken}`)
          .send({ status })
          .expect(200);
        expect((res.body as OrderResponse).data.status).toBe(status);
      }

      const final = await request(app.getHttpServer())
        .get(`/orders/${order.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const history = (final.body as OrderResponse).data.statusHistory!.map((h) => h.status);
      expect(history).toEqual(["DRAFT", "PENDING", "ASSIGNED", "PICKED_UP", "IN_TRANSIT", "DELIVERED"]);
    });

    it("rejects skipping a step (DRAFT -> PICKED_UP)", async () => {
      const admin = await registerAdmin(`Status Skip Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const order = await createOrder(admin, customer.id);

      await request(app.getHttpServer())
        .post(`/orders/${order.id}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "PICKED_UP" })
        .expect(409);
    });

    it("rejects moving to ASSIGNED via the status endpoint without a driver/vehicle set", async () => {
      const admin = await registerAdmin(`Status Assigned Without Fleet Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const order = await createOrder(admin, customer.id);
      await advanceToPending(admin, order.id);

      await request(app.getHttpServer())
        .post(`/orders/${order.id}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "ASSIGNED" })
        .expect(409);
    });

    it("rejects transitioning a terminal (DELIVERED) order further", async () => {
      const admin = await registerAdmin(`Status Terminal Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const driver = await createDriver(admin);
      const vehicle = await createVehicle(admin);
      const order = await createOrder(admin, customer.id);
      await advanceToPending(admin, order.id);
      await request(app.getHttpServer())
        .post(`/orders/${order.id}/assign`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ driverId: driver.id, vehicleId: vehicle.id })
        .expect(200);
      for (const status of ["PICKED_UP", "IN_TRANSIT", "DELIVERED"]) {
        await request(app.getHttpServer())
          .post(`/orders/${order.id}/status`)
          .set("Authorization", `Bearer ${admin.accessToken}`)
          .send({ status })
          .expect(200);
      }

      await request(app.getHttpServer())
        .post(`/orders/${order.id}/status`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "IN_TRANSIT" })
        .expect(409);

      await request(app.getHttpServer())
        .patch(`/orders/${order.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ notes: "too late" })
        .expect(409);
    });
  });

  describe("cancellation", () => {
    it("allows cancelling from any non-terminal status", async () => {
      const admin = await registerAdmin(`Cancel Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const order = await createOrder(admin, customer.id);

      const res = await request(app.getHttpServer())
        .post(`/orders/${order.id}/cancel`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ note: "Customer changed their mind" })
        .expect(200);
      expect((res.body as OrderResponse).data.status).toBe("CANCELLED");
    });

    it("rejects cancelling an already-DELIVERED or already-CANCELLED order", async () => {
      const admin = await registerAdmin(`Cancel Rules Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const order = await createOrder(admin, customer.id);
      await request(app.getHttpServer())
        .post(`/orders/${order.id}/cancel`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/orders/${order.id}/cancel`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(409);
    });
  });

  describe("assignment validation", () => {
    it("rejects assigning a non-ACTIVE driver or non-AVAILABLE vehicle", async () => {
      const admin = await registerAdmin(`Assign Fleet Status Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const driver = await createDriver(admin);
      const vehicle = await createVehicle(admin);
      const order = await createOrder(admin, customer.id);
      await advanceToPending(admin, order.id);

      await request(app.getHttpServer())
        .patch(`/drivers/${driver.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "ON_LEAVE" })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/orders/${order.id}/assign`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ driverId: driver.id, vehicleId: vehicle.id })
        .expect(409);

      await request(app.getHttpServer())
        .patch(`/drivers/${driver.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "ACTIVE" })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/vehicles/${vehicle.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ status: "MAINTENANCE" })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/orders/${order.id}/assign`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ driverId: driver.id, vehicleId: vehicle.id })
        .expect(409);
    });

    it("rejects when cargo weight exceeds vehicle capacity", async () => {
      const admin = await registerAdmin(`Assign Capacity Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const driver = await createDriver(admin);
      const vehicle = await createVehicle(admin, { capacityKg: 1000 });
      const order = await createOrder(admin, customer.id, { cargoWeightKg: 1500 });
      await advanceToPending(admin, order.id);

      const res = await request(app.getHttpServer())
        .post(`/orders/${order.id}/assign`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ driverId: driver.id, vehicleId: vehicle.id })
        .expect(400);
      expect((res.body as ErrorBody).error.message).toMatch(/exceeds vehicle capacity/i);
    });

    it("allows assignment when capacity fields are absent (nothing to validate against)", async () => {
      const admin = await registerAdmin(`Assign No Capacity Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const driver = await createDriver(admin);
      const vehicle = await createVehicle(admin); // no capacityKg/capacityM3
      const order = await createOrder(admin, customer.id, { cargoWeightKg: 99999 });
      await advanceToPending(admin, order.id);

      await request(app.getHttpServer())
        .post(`/orders/${order.id}/assign`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ driverId: driver.id, vehicleId: vehicle.id })
        .expect(200);
    });

    it("prevents double-booking a driver/vehicle across overlapping orders, including touching boundaries", async () => {
      const admin = await registerAdmin(`Double Booking Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const driver = await createDriver(admin);
      const vehicle = await createVehicle(admin);

      const orderA = await createOrder(admin, customer.id, {
        pickupDate: "2027-09-01T09:00:00.000Z",
        deliveryDate: "2027-09-05T09:00:00.000Z",
      });
      await advanceToPending(admin, orderA.id);
      await request(app.getHttpServer())
        .post(`/orders/${orderA.id}/assign`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ driverId: driver.id, vehicleId: vehicle.id })
        .expect(200);

      // Touching boundary: starts exactly when orderA ends -> still overlaps (inclusive rule).
      const orderB = await createOrder(admin, customer.id, {
        pickupDate: "2027-09-05T09:00:00.000Z",
        deliveryDate: "2027-09-10T09:00:00.000Z",
      });
      await advanceToPending(admin, orderB.id);
      const conflictRes = await request(app.getHttpServer())
        .post(`/orders/${orderB.id}/assign`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ driverId: driver.id, vehicleId: vehicle.id })
        .expect(409);
      expect((conflictRes.body as ErrorBody).error.message).toMatch(/overlapping order/i);

      // Starts the day after orderA ends -> no overlap, allowed.
      const orderC = await createOrder(admin, customer.id, {
        pickupDate: "2027-09-06T09:00:00.000Z",
        deliveryDate: "2027-09-10T09:00:00.000Z",
      });
      await advanceToPending(admin, orderC.id);
      await request(app.getHttpServer())
        .post(`/orders/${orderC.id}/assign`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ driverId: driver.id, vehicleId: vehicle.id })
        .expect(200);
    });

    it("a cancelled order's assignment no longer blocks the driver/vehicle for the same dates", async () => {
      const admin = await registerAdmin(`Cancelled Frees Fleet Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const driver = await createDriver(admin);
      const vehicle = await createVehicle(admin);

      const orderA = await createOrder(admin, customer.id);
      await advanceToPending(admin, orderA.id);
      await request(app.getHttpServer())
        .post(`/orders/${orderA.id}/assign`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ driverId: driver.id, vehicleId: vehicle.id })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/orders/${orderA.id}/cancel`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const orderB = await createOrder(admin, customer.id); // same default date range
      await advanceToPending(admin, orderB.id);
      await request(app.getHttpServer())
        .post(`/orders/${orderB.id}/assign`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ driverId: driver.id, vehicleId: vehicle.id })
        .expect(200);
    });
  });

  describe("delay calculation", () => {
    it("is delayed when deliveryDate has passed and status isn't DELIVERED/CANCELLED", async () => {
      const admin = await registerAdmin(`Delay Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const order = await createOrder(admin, customer.id, {
        pickupDate: "2020-01-01T09:00:00.000Z",
        deliveryDate: "2020-01-05T09:00:00.000Z",
      });
      expect(order.isDelayed).toBe(true);

      const cancelled = await request(app.getHttpServer())
        .post(`/orders/${order.id}/cancel`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      expect((cancelled.body as OrderResponse).data.isDelayed).toBe(false);
    });
  });

  describe("tenancy isolation", () => {
    it("an order id from another organization returns 404, and lists never cross organizations", async () => {
      const adminA = await registerAdmin(`Order Isolation Org A ${randomUUID()}`);
      const adminB = await registerAdmin(`Order Isolation Org B ${randomUUID()}`);
      const customerA = await createCustomer(adminA);
      const orderA = await createOrder(adminA, customerA.id);

      await request(app.getHttpServer())
        .get(`/orders/${orderA.id}`)
        .set("Authorization", `Bearer ${adminB.accessToken}`)
        .expect(404);

      const listB = await request(app.getHttpServer())
        .get("/orders")
        .set("Authorization", `Bearer ${adminB.accessToken}`)
        .expect(200);
      expect((listB.body as OrderListResponse).data.items.some((o) => o.id === orderA.id)).toBe(false);
    });
  });

  describe("role restrictions", () => {
    it("SALES_CRM_MANAGER can create/read/update but not assign/status/cancel", async () => {
      const admin = await registerAdmin(`Sales Order Role Org ${randomUUID()}`);
      const sales = await addMemberWithRole(admin, "SALES_CRM_MANAGER");
      const customer = await createCustomer(admin);
      const driver = await createDriver(admin);
      const vehicle = await createVehicle(admin);

      const createRes = await request(app.getHttpServer())
        .post("/orders")
        .set("Authorization", `Bearer ${sales.accessToken}`)
        .send({
          customerId: customer.id,
          pickupAddress: "1 Main St",
          pickupCity: "Tashkent",
          pickupDate: FUTURE_PICKUP,
          deliveryAddress: "2 Side St",
          deliveryCity: "Samarkand",
          deliveryDate: FUTURE_DELIVERY,
          cargoDescription: "General freight",
          price: 500,
        })
        .expect(201);
      const order = (createRes.body as OrderResponse).data;

      await request(app.getHttpServer())
        .patch(`/orders/${order.id}`)
        .set("Authorization", `Bearer ${sales.accessToken}`)
        .send({ notes: "Sales edit" })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/orders/${order.id}/assign`)
        .set("Authorization", `Bearer ${sales.accessToken}`)
        .send({ driverId: driver.id, vehicleId: vehicle.id })
        .expect(403);

      await request(app.getHttpServer())
        .post(`/orders/${order.id}/status`)
        .set("Authorization", `Bearer ${sales.accessToken}`)
        .send({ status: "PENDING" })
        .expect(403);

      await request(app.getHttpServer())
        .post(`/orders/${order.id}/cancel`)
        .set("Authorization", `Bearer ${sales.accessToken}`)
        .expect(403);
    });

    it("ACCOUNTANT is read-only on orders", async () => {
      const admin = await registerAdmin(`Accountant Order Role Org ${randomUUID()}`);
      const accountant = await addMemberWithRole(admin, "ACCOUNTANT");
      const customer = await createCustomer(admin);
      const order = await createOrder(admin, customer.id);

      await request(app.getHttpServer())
        .get("/orders")
        .set("Authorization", `Bearer ${accountant.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/orders/${order.id}`)
        .set("Authorization", `Bearer ${accountant.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post("/orders")
        .set("Authorization", `Bearer ${accountant.accessToken}`)
        .send({ customerId: customer.id })
        .expect(403);
    });

    it("DRIVER has no access at all", async () => {
      const admin = await registerAdmin(`Driver Role Order Org ${randomUUID()}`);
      const driverUser = await addMemberWithRole(admin, "DRIVER");
      await request(app.getHttpServer())
        .get("/orders")
        .set("Authorization", `Bearer ${driverUser.accessToken}`)
        .expect(403);
    });
  });

  describe("audit logs", () => {
    it("records create, update, assign, status_change, and cancel", async () => {
      const admin = await registerAdmin(`Order Audit Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const driver = await createDriver(admin);
      const vehicle = await createVehicle(admin);
      const order = await createOrder(admin, customer.id);

      await request(app.getHttpServer())
        .patch(`/orders/${order.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ notes: "updated" })
        .expect(200);
      await advanceToPending(admin, order.id);
      await request(app.getHttpServer())
        .post(`/orders/${order.id}/assign`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ driverId: driver.id, vehicleId: vehicle.id })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/orders/${order.id}/cancel`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);

      const logs = await prisma.auditLog.findMany({
        where: { entityType: "Order", entityId: order.id },
        orderBy: { createdAt: "asc" },
      });
      expect(logs.map((l) => l.action)).toEqual([
        "order.create",
        "order.update",
        "order.status_change",
        "order.assign",
        "order.cancel",
      ]);
    });
  });

  describe("Dispatch board + availability", () => {
    it("board lists unassigned PENDING orders and correctly buckets driver/vehicle availability", async () => {
      const admin = await registerAdmin(`Dispatch Board Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const freeDriver = await createDriver(admin);
      const busyDriver = await createDriver(admin);
      const freeVehicle = await createVehicle(admin);
      const busyVehicle = await createVehicle(admin);

      const pendingOrder = await createOrder(admin, customer.id);
      await advanceToPending(admin, pendingOrder.id);

      const assignedOrder = await createOrder(admin, customer.id, {
        pickupDate: "2027-10-01T09:00:00.000Z",
        deliveryDate: "2027-10-05T09:00:00.000Z",
      });
      await advanceToPending(admin, assignedOrder.id);
      await request(app.getHttpServer())
        .post(`/orders/${assignedOrder.id}/assign`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ driverId: busyDriver.id, vehicleId: busyVehicle.id })
        .expect(200);

      const board = await request(app.getHttpServer())
        .get("/dispatch/board")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const boardBody = board.body as {
        data: {
          unassignedOrders: { id: string }[];
          drivers: { available: { id: string }[]; busy: { driver: { id: string } }[] };
          vehicles: { available: { id: string }[]; busy: { vehicle: { id: string } }[] };
        };
      };

      expect(boardBody.data.unassignedOrders.some((o) => o.id === pendingOrder.id)).toBe(true);
      expect(boardBody.data.drivers.available.some((d) => d.id === freeDriver.id)).toBe(true);
      expect(boardBody.data.drivers.busy.some((b) => b.driver.id === busyDriver.id)).toBe(true);
      expect(boardBody.data.vehicles.available.some((v) => v.id === freeVehicle.id)).toBe(true);
      expect(boardBody.data.vehicles.busy.some((b) => b.vehicle.id === busyVehicle.id)).toBe(true);
    });

    it("availability with a date range excludes drivers/vehicles busy on overlapping orders", async () => {
      const admin = await registerAdmin(`Dispatch Availability Org ${randomUUID()}`);
      const customer = await createCustomer(admin);
      const driver = await createDriver(admin);
      const vehicle = await createVehicle(admin);

      const order = await createOrder(admin, customer.id, {
        pickupDate: "2027-11-01T09:00:00.000Z",
        deliveryDate: "2027-11-05T09:00:00.000Z",
      });
      await advanceToPending(admin, order.id);
      await request(app.getHttpServer())
        .post(`/orders/${order.id}/assign`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ driverId: driver.id, vehicleId: vehicle.id })
        .expect(200);

      const overlapping = await request(app.getHttpServer())
        .get("/dispatch/availability?pickupDate=2027-11-03T00:00:00.000Z&deliveryDate=2027-11-08T00:00:00.000Z")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const overlappingBody = overlapping.body as { data: { drivers: { id: string }[]; vehicles: { id: string }[] } };
      expect(overlappingBody.data.drivers.some((d) => d.id === driver.id)).toBe(false);
      expect(overlappingBody.data.vehicles.some((v) => v.id === vehicle.id)).toBe(false);

      const nonOverlapping = await request(app.getHttpServer())
        .get("/dispatch/availability?pickupDate=2027-11-10T00:00:00.000Z&deliveryDate=2027-11-15T00:00:00.000Z")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .expect(200);
      const nonOverlappingBody = nonOverlapping.body as {
        data: { drivers: { id: string }[]; vehicles: { id: string }[] };
      };
      expect(nonOverlappingBody.data.drivers.some((d) => d.id === driver.id)).toBe(true);
      expect(nonOverlappingBody.data.vehicles.some((v) => v.id === vehicle.id)).toBe(true);
    });

    it("SALES_CRM_MANAGER cannot access dispatch; ACCOUNTANT can (read-only)", async () => {
      const admin = await registerAdmin(`Dispatch Role Org ${randomUUID()}`);
      const sales = await addMemberWithRole(admin, "SALES_CRM_MANAGER");
      const accountant = await addMemberWithRole(admin, "ACCOUNTANT");

      await request(app.getHttpServer())
        .get("/dispatch/board")
        .set("Authorization", `Bearer ${sales.accessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get("/dispatch/board")
        .set("Authorization", `Bearer ${accountant.accessToken}`)
        .expect(200);
    });
  });
});
