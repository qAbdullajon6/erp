// Explicit, manually-run seed for a demo/sales Test Organization —
// deliberately SEPARATE from prisma/seed.ts (the file Prisma's own
// "prisma": { "seed": ... } config auto-invokes after `migrate reset`).
// This script is only ever run via `npm run seed:test-org`, never
// automatically, so a fresh real-customer database is never silently
// populated with fake data.
//
// Everything created here is scoped to ONE organization
// ("FlowERP Test Logistics", slug flowerp-test-logistics) — multi-tenant
// isolation is what actually keeps this from ever mixing with a real
// organization's data, the same guarantee every other tenant relies on.
// Test user emails use the IANA-reserved `.test` TLD (RFC 2606) so they can
// never collide with or accidentally email a real address.

import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

const TEST_ORG_SLUG = "flowerp-test-logistics";
const TEST_ORG_NAME = "FlowERP Test Logistics";
const TEST_PASSWORD = "FlowERP-Test-2026!";

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

async function main() {
  const existing = await prisma.organization.findUnique({ where: { slug: TEST_ORG_SLUG } });
  if (existing) {
    console.log(
      `Test organization "${TEST_ORG_NAME}" already exists (id=${existing.id}). ` +
        "Refusing to create a duplicate. To reseed from scratch, delete it AND its users first " +
        "(deleting the organization alone cascades its memberships/drivers/vehicles/customers/" +
        "orders, but NOT the User rows themselves — a User isn't owned by one Organization):\n" +
        `  DELETE FROM organizations WHERE slug = '${TEST_ORG_SLUG}';\n` +
        "  DELETE FROM users WHERE email LIKE '%@flowerp.test';\n" +
        "then re-run: npm run seed:test-org",
    );
    return;
  }

  const passwordHash = await hashPassword(TEST_PASSWORD);

  const organization = await prisma.organization.create({
    data: {
      name: TEST_ORG_NAME,
      slug: TEST_ORG_SLUG,
      defaultCurrency: "USD",
      timezone: "Asia/Tashkent",
    },
  });

  const roleUsers: { email: string; firstName: string; lastName: string; role: string }[] = [
    { email: "admin@flowerp.test", firstName: "Test", lastName: "Admin", role: "ADMIN" },
    { email: "ops-manager@flowerp.test", firstName: "Test", lastName: "OpsManager", role: "OPERATIONS_MANAGER" },
    { email: "dispatcher@flowerp.test", firstName: "Test", lastName: "Dispatcher", role: "DISPATCHER" },
    { email: "accountant@flowerp.test", firstName: "Test", lastName: "Accountant", role: "ACCOUNTANT" },
    { email: "sales@flowerp.test", firstName: "Test", lastName: "SalesManager", role: "SALES_CRM_MANAGER" },
    { email: "driver@flowerp.test", firstName: "Test", lastName: "Driver", role: "DRIVER" },
  ];

  for (const roleUser of roleUsers) {
    const user = await prisma.user.create({
      data: { email: roleUser.email, firstName: roleUser.firstName, lastName: roleUser.lastName, passwordHash },
    });
    await prisma.membership.create({
      data: { organizationId: organization.id, userId: user.id, role: roleUser.role as never },
    });
  }

  const drivers = await Promise.all(
    [
      { employeeCode: "EMP-0001", firstName: "Bekzod", lastName: "Yusupov", phone: "+998901110001", licenseNumber: "AA1234567" },
      { employeeCode: "EMP-0002", firstName: "Shohruh", lastName: "Toshmatov", phone: "+998901110002", licenseNumber: "AA2345678" },
      { employeeCode: "EMP-0003", firstName: "Dilnoza", lastName: "Ergasheva", phone: "+998901110003", licenseNumber: "AA3456789" },
    ].map((d) => prisma.driver.create({ data: { organizationId: organization.id, ...d } })),
  );

  const vehicles = await Promise.all(
    [
      { vehicleCode: "VEH-0001", plateNumber: "01A111AA", type: "truck", capacityKg: 5000, capacityM3: 25, make: "Isuzu", model: "NPR", year: 2021 },
      { vehicleCode: "VEH-0002", plateNumber: "01A222BB", type: "van", capacityKg: 1200, capacityM3: 8, make: "Ford", model: "Transit", year: 2022 },
      { vehicleCode: "VEH-0003", plateNumber: "01A333CC", type: "refrigerated truck", capacityKg: 3000, capacityM3: 15, make: "Hyundai", model: "Mighty", year: 2020 },
    ].map((v) => prisma.vehicle.create({ data: { organizationId: organization.id, ...v } })),
  );

  const customers = await Promise.all(
    [
      {
        customerCode: "CUS-0001",
        companyName: "Silk Road Traders (Test)",
        contactName: "Ali Rahimov",
        email: "ali@silkroadtraders.test",
        phone: "+998901220001",
        city: "Tashkent",
        country: "Uzbekistan",
        creditLimit: 20000,
      },
      {
        customerCode: "CUS-0002",
        companyName: "Bukhara Foods (Test)",
        contactName: "Malika Yusupova",
        email: "malika@bukharafoods.test",
        phone: "+998901220002",
        city: "Bukhara",
        country: "Uzbekistan",
        creditLimit: 12000,
      },
      {
        customerCode: "CUS-0003",
        companyName: "Andijan Textiles (Test)",
        contactName: "Farrukh Islomov",
        email: "farrukh@andijantextiles.test",
        phone: "+998901220003",
        city: "Andijan",
        country: "Uzbekistan",
        creditLimit: 8000,
      },
    ].map((c) => prisma.customer.create({ data: { organizationId: organization.id, ...c } })),
  );

  const now = Date.now();
  const days = (n: number) => new Date(now + n * 24 * 60 * 60 * 1000);

  type SeedOrder = {
    orderNumber: string;
    customerId: string;
    pickupCity: string;
    deliveryCity: string;
    pickupDate: Date;
    deliveryDate: Date;
    cargoDescription: string;
    price: number;
    status: "DRAFT" | "PENDING" | "ASSIGNED" | "PICKED_UP" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED";
    driverId?: string;
    vehicleId?: string;
    deliveredAt?: Date;
    cancelledAt?: Date;
    history: { status: string; note: string }[];
  };

  const seedOrders: SeedOrder[] = [
    {
      orderNumber: `ORD-${new Date().getUTCFullYear()}-0001`,
      customerId: customers[0].id,
      pickupCity: "Tashkent",
      deliveryCity: "Samarkand",
      pickupDate: days(5),
      deliveryDate: days(6),
      cargoDescription: "[TEST DATA] General cargo, still being drafted",
      price: 450,
      status: "DRAFT",
      history: [{ status: "DRAFT", note: "Order created (seed)" }],
    },
    {
      orderNumber: `ORD-${new Date().getUTCFullYear()}-0002`,
      customerId: customers[1].id,
      pickupCity: "Bukhara",
      deliveryCity: "Tashkent",
      pickupDate: days(3),
      deliveryDate: days(4),
      cargoDescription: "[TEST DATA] Packaged food goods, ready for dispatch",
      price: 620,
      status: "PENDING",
      history: [
        { status: "DRAFT", note: "Order created (seed)" },
        { status: "PENDING", note: "Ready for dispatch (seed)" },
      ],
    },
    {
      orderNumber: `ORD-${new Date().getUTCFullYear()}-0003`,
      customerId: customers[2].id,
      pickupCity: "Andijan",
      deliveryCity: "Tashkent",
      pickupDate: days(2),
      deliveryDate: days(3),
      cargoDescription: "[TEST DATA] Textile rolls, driver and vehicle assigned",
      price: 800,
      status: "ASSIGNED",
      driverId: drivers[0].id,
      vehicleId: vehicles[0].id,
      history: [
        { status: "DRAFT", note: "Order created (seed)" },
        { status: "PENDING", note: "Ready for dispatch (seed)" },
        { status: "ASSIGNED", note: "Driver and vehicle assigned (seed)" },
      ],
    },
    {
      orderNumber: `ORD-${new Date().getUTCFullYear()}-0004`,
      customerId: customers[0].id,
      pickupCity: "Tashkent",
      deliveryCity: "Bukhara",
      pickupDate: days(-1),
      deliveryDate: days(1),
      cargoDescription: "[TEST DATA] Currently on the road",
      price: 950,
      status: "IN_TRANSIT",
      driverId: drivers[1].id,
      vehicleId: vehicles[1].id,
      history: [
        { status: "DRAFT", note: "Order created (seed)" },
        { status: "PENDING", note: "Ready for dispatch (seed)" },
        { status: "ASSIGNED", note: "Driver and vehicle assigned (seed)" },
        { status: "PICKED_UP", note: "Cargo picked up (seed)" },
        { status: "IN_TRANSIT", note: "En route (seed)" },
      ],
    },
    {
      orderNumber: `ORD-${new Date().getUTCFullYear()}-0005`,
      customerId: customers[1].id,
      pickupCity: "Bukhara",
      deliveryCity: "Andijan",
      pickupDate: days(-10),
      deliveryDate: days(-8),
      cargoDescription: "[TEST DATA] Completed delivery, for reporting/history demos",
      price: 1100,
      status: "DELIVERED",
      driverId: drivers[2].id,
      vehicleId: vehicles[2].id,
      deliveredAt: days(-8),
      history: [
        { status: "DRAFT", note: "Order created (seed)" },
        { status: "PENDING", note: "Ready for dispatch (seed)" },
        { status: "ASSIGNED", note: "Driver and vehicle assigned (seed)" },
        { status: "PICKED_UP", note: "Cargo picked up (seed)" },
        { status: "IN_TRANSIT", note: "En route (seed)" },
        { status: "DELIVERED", note: "Delivered on time (seed)" },
      ],
    },
    {
      orderNumber: `ORD-${new Date().getUTCFullYear()}-0006`,
      customerId: customers[2].id,
      pickupCity: "Andijan",
      deliveryCity: "Samarkand",
      pickupDate: days(-5),
      deliveryDate: days(-3),
      cargoDescription: "[TEST DATA] Cancelled by customer, for cancellation-flow demos",
      price: 500,
      status: "CANCELLED",
      cancelledAt: days(-4),
      history: [
        { status: "DRAFT", note: "Order created (seed)" },
        { status: "PENDING", note: "Ready for dispatch (seed)" },
        { status: "CANCELLED", note: "Customer cancelled the shipment (seed)" },
      ],
    },
    {
      orderNumber: `ORD-${new Date().getUTCFullYear()}-0007`,
      customerId: customers[0].id,
      pickupCity: "Tashkent",
      deliveryCity: "Andijan",
      pickupDate: days(-6),
      deliveryDate: days(-2),
      cargoDescription: "[TEST DATA] Deliberately overdue — for the delayed-order demo (isDelayed: true)",
      price: 700,
      status: "PENDING",
      history: [
        { status: "DRAFT", note: "Order created (seed)" },
        { status: "PENDING", note: "Ready for dispatch, still unassigned and now overdue (seed)" },
      ],
    },
  ];

  for (const seedOrder of seedOrders) {
    const order = await prisma.order.create({
      data: {
        organizationId: organization.id,
        orderNumber: seedOrder.orderNumber,
        customerId: seedOrder.customerId,
        pickupAddress: "Test pickup address",
        pickupCity: seedOrder.pickupCity,
        pickupDate: seedOrder.pickupDate,
        deliveryAddress: "Test delivery address",
        deliveryCity: seedOrder.deliveryCity,
        deliveryDate: seedOrder.deliveryDate,
        cargoDescription: seedOrder.cargoDescription,
        price: seedOrder.price,
        currency: "USD",
        status: seedOrder.status,
        driverId: seedOrder.driverId,
        vehicleId: seedOrder.vehicleId,
        deliveredAt: seedOrder.deliveredAt,
        cancelledAt: seedOrder.cancelledAt,
      },
    });

    for (const entry of seedOrder.history) {
      await prisma.orderStatusHistory.create({
        data: {
          organizationId: organization.id,
          orderId: order.id,
          status: entry.status as never,
          note: entry.note,
        },
      });
    }
  }

  console.log(`Created test organization "${TEST_ORG_NAME}" (slug: ${TEST_ORG_SLUG}).`);
  console.log(`All test accounts share the password: ${TEST_PASSWORD}`);
  console.log("Sign in at /auth/login with any of:");
  for (const roleUser of roleUsers) {
    console.log(`  ${roleUser.email}  (${roleUser.role})`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
