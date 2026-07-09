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

  const usersByRole = new Map<string, { id: string }>();
  for (const roleUser of roleUsers) {
    const user = await prisma.user.create({
      data: { email: roleUser.email, firstName: roleUser.firstName, lastName: roleUser.lastName, passwordHash },
    });
    usersByRole.set(roleUser.role, user);
    await prisma.membership.create({
      data: { organizationId: organization.id, userId: user.id, role: roleUser.role as never },
    });
  }
  const adminUser = usersByRole.get("ADMIN")!;

  // drivers[0] (Bekzod) is deliberately linked to the driver@flowerp.test
  // login account (Driver.userId) so the My Deliveries phase has a real,
  // non-empty demo: it's the driver with the most seed orders assigned
  // below. The other two seed drivers intentionally have no linked login —
  // most Driver rows never do, only ones an admin has explicitly linked.
  const drivers = await Promise.all(
    [
      {
        employeeCode: "EMP-0001",
        firstName: "Bekzod",
        lastName: "Yusupov",
        phone: "+998901110001",
        licenseNumber: "AA1234567",
        userId: usersByRole.get("DRIVER")!.id,
      },
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

  const orders: { id: string; orderNumber: string; pickupDate: Date; deliveryDate: Date }[] = [];
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
    orders.push(order);

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
  const deliveredOrder = orders[4]; // ORD-...-0005, the DELIVERED one
  const invoiceYear = new Date().getUTCFullYear();

  // --- Add a negative-profit delivered order for testing
  // NEGATIVE_PROFIT notification (order revenue < approved expenses)
  const negativeProfitOrder = await prisma.order.create({
    data: {
      organizationId: organization.id,
      orderNumber: `ORD-${new Date().getUTCFullYear()}-0008`,
      customerId: customers[1].id,
      pickupAddress: "Test pickup address",
      pickupCity: "Samarkand",
      pickupDate: days(-8),
      deliveryAddress: "Test delivery address",
      deliveryCity: "Bukhara",
      deliveryDate: days(-7),
      cargoDescription: "[TEST DATA] Low-margin order for negative profit demo",
      price: 100, // Very low price
      currency: "USD",
      status: "DELIVERED",
      driverId: drivers[0].id,
      vehicleId: vehicles[1].id,
      deliveredAt: days(-7),
    },
  });
  await prisma.orderStatusHistory.create({
    data: {
      organizationId: organization.id,
      orderId: negativeProfitOrder.id,
      status: "DELIVERED",
      note: "Negative profit order for demo (seed)",
    },
  });

  // --- Add expiry-warning driver and vehicles for FLEET notifications ---

  // Update driver to have expiry warning (license expires in 7 days)
  await prisma.driver.update({
    where: { id: drivers[0].id },
    data: { licenseExpiry: days(7) },
  });

  // Update vehicle to have insurance expiry warning (expires in 14 days)
  await prisma.vehicle.update({
    where: { id: vehicles[0].id },
    data: { insuranceExpiry: days(14) },
  });

  // Update another vehicle to have inspection expiry warning (expires in 1 day)
  await prisma.vehicle.update({
    where: { id: vehicles[1].id },
    data: { inspectionExpiry: days(1) },
  });

  // --- Add customer credit-limit scenarios ---

  // Customer 0: near credit limit (80% utilization triggers NEAR warning)
  // creditLimit = 20000, create invoice for 16000 (80% of limit)
  const creditNearInvoice = await createInvoice({
    invoiceNumber: `INV-${invoiceYear}-0006`,
    customerId: customers[0].id,
    dueDate: days(15),
    status: "SENT",
    lineItems: [{ description: "[TEST DATA] Large order, near credit limit", quantity: 1, unitPrice: 16000 }],
  });

  // Customer 2: credit limit exceeded
  // creditLimit = 8000, create invoice for 10000 (125% of limit)
  const creditExceededInvoice = await createInvoice({
    invoiceNumber: `INV-${invoiceYear}-0007`,
    customerId: customers[2].id,
    dueDate: days(15),
    status: "SENT",
    lineItems: [{ description: "[TEST DATA] Exceeds credit limit", quantity: 1, unitPrice: 10000 }],
  });

  // --- Add invoice due soon for INVOICE_DUE_SOON notification (due in 2 days, threshold is 3) ---

  const invoiceDueSoon = await createInvoice({
    invoiceNumber: `INV-${invoiceYear}-0008`,
    customerId: customers[1].id,
    dueDate: days(2),
    status: "SENT",
    lineItems: [{ description: "[TEST DATA] Invoice due soon", quantity: 1, unitPrice: 500 }],
  });

  // --- Finance: invoices, payments, expenses — all clearly labelled test
  // data, covering every invoice status and both expense decisions. ---

  async function createInvoice(params: {
    invoiceNumber: string;
    customerId: string;
    orderId?: string;
    dueDate?: Date;
    status: "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
    lineItems: { description: string; quantity: number; unitPrice: number }[];
    discountAmount?: number;
    taxAmount?: number;
    paidAmount?: number;
    cancelledAt?: Date;
  }) {
    const subtotal = params.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
    const discountAmount = params.discountAmount ?? 0;
    const taxAmount = params.taxAmount ?? 0;
    const totalAmount = subtotal - discountAmount + taxAmount;
    const paidAmount = params.paidAmount ?? 0;
    const invoice = await prisma.invoice.create({
      data: {
        organizationId: organization.id,
        invoiceNumber: params.invoiceNumber,
        customerId: params.customerId,
        orderId: params.orderId,
        dueDate: params.dueDate,
        status: params.status,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        paidAmount,
        balanceDue: totalAmount - paidAmount,
        cancelledAt: params.cancelledAt,
        lineItems: {
          create: params.lineItems.map((li) => ({
            organizationId: organization.id,
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            lineTotal: li.quantity * li.unitPrice,
          })),
        },
      },
    });
    return invoice;
  }

  const paidInvoice = await createInvoice({
    invoiceNumber: `INV-${invoiceYear}-0001`,
    customerId: customers[1].id,
    orderId: deliveredOrder.id,
    status: "PAID",
    lineItems: [{ description: `Order ${deliveredOrder.orderNumber}`, quantity: 1, unitPrice: 1100 }],
    paidAmount: 1100,
  });
  await prisma.payment.create({
    data: {
      organizationId: organization.id,
      invoiceId: paidInvoice.id,
      amount: 1100,
      method: "BANK_TRANSFER",
      reference: "TEST-WIRE-0001",
      notes: "[TEST DATA] Paid in full (seed)",
    },
  });

  const partiallyPaidInvoice = await createInvoice({
    invoiceNumber: `INV-${invoiceYear}-0002`,
    customerId: customers[0].id,
    dueDate: days(10),
    status: "PARTIALLY_PAID",
    lineItems: [{ description: "[TEST DATA] Monthly logistics retainer", quantity: 1, unitPrice: 900 }],
    paidAmount: 400,
  });
  await prisma.payment.create({
    data: {
      organizationId: organization.id,
      invoiceId: partiallyPaidInvoice.id,
      amount: 400,
      method: "CARD",
      notes: "[TEST DATA] Partial payment (seed)",
    },
  });

  await createInvoice({
    invoiceNumber: `INV-${invoiceYear}-0003`,
    customerId: customers[2].id,
    dueDate: days(-15),
    status: "OVERDUE",
    lineItems: [{ description: "[TEST DATA] Overdue invoice — for the overdue-status demo", quantity: 1, unitPrice: 640 }],
  });

  await createInvoice({
    invoiceNumber: `INV-${invoiceYear}-0004`,
    customerId: customers[0].id,
    status: "DRAFT",
    lineItems: [{ description: "[TEST DATA] Draft invoice, still editable", quantity: 2, unitPrice: 175 }],
    discountAmount: 20,
  });

  await createInvoice({
    invoiceNumber: `INV-${invoiceYear}-0005`,
    customerId: customers[1].id,
    status: "CANCELLED",
    lineItems: [{ description: "[TEST DATA] Cancelled invoice — for the cancellation-flow demo", quantity: 1, unitPrice: 300 }],
    cancelledAt: days(-2),
  });

  const expenseYear = new Date().getUTCFullYear();
  await prisma.expense.createMany({
    data: [
      {
        organizationId: organization.id,
        expenseNumber: `EXP-${expenseYear}-0001`,
        orderId: deliveredOrder.id,
        vehicleId: vehicles[2].id,
        driverId: drivers[2].id,
        category: "FUEL",
        description: "[TEST DATA] Diesel for delivered order (seed)",
        amount: 150,
        status: "APPROVED",
        approvedByUserId: adminUser.id,
        approvedAt: new Date(),
      },
      {
        organizationId: organization.id,
        expenseNumber: `EXP-${expenseYear}-0002`,
        orderId: deliveredOrder.id,
        category: "TOLL",
        description: "[TEST DATA] Toll fees, awaiting approval (seed)",
        amount: 40,
        status: "PENDING",
      },
      {
        organizationId: organization.id,
        expenseNumber: `EXP-${expenseYear}-0003`,
        vehicleId: vehicles[0].id,
        category: "MAINTENANCE",
        description: "[TEST DATA] Scheduled maintenance, not tied to a specific order (seed)",
        amount: 300,
        status: "APPROVED",
        approvedByUserId: adminUser.id,
        approvedAt: new Date(),
      },
      {
        organizationId: organization.id,
        expenseNumber: `EXP-${expenseYear}-0004`,
        driverId: drivers[1].id,
        category: "DRIVER_ADVANCE",
        description: "[TEST DATA] Driver cash advance, awaiting approval (seed)",
        amount: 200,
        status: "PENDING",
      },
      {
        organizationId: organization.id,
        expenseNumber: `EXP-${expenseYear}-0005`,
        vehicleId: vehicles[2].id,
        category: "INSURANCE",
        description: "[TEST DATA] Rejected duplicate insurance submission (seed)",
        amount: 500,
        status: "REJECTED",
        approvedByUserId: adminUser.id,
        approvedAt: new Date(),
        rejectionReason: "Duplicate submission (seed)",
      },
      {
        organizationId: organization.id,
        expenseNumber: `EXP-${expenseYear}-0006`,
        orderId: negativeProfitOrder.id,
        vehicleId: vehicles[1].id,
        driverId: drivers[0].id,
        category: "FUEL",
        description: "[TEST DATA] High fuel cost for negative-profit order (seed)",
        amount: 80,
        status: "APPROVED",
        approvedByUserId: adminUser.id,
        approvedAt: new Date(),
      },
      {
        organizationId: organization.id,
        expenseNumber: `EXP-${expenseYear}-0007`,
        orderId: negativeProfitOrder.id,
        category: "TOLL",
        description: "[TEST DATA] Toll for negative-profit order (seed)",
        amount: 50,
        status: "APPROVED",
        approvedByUserId: adminUser.id,
        approvedAt: new Date(),
      },
    ],
  });

  // --- Add dispatches for operational workflow demos
  const dispatcherUser = usersByRole.get("DISPATCHER")!;

  // Dispatch for ASSIGNED order (ORD-...-0003)
  await prisma.dispatch.create({
    data: {
      organizationId: organization.id,
      dispatchNumber: "DSP-000001",
      orderId: orders[2].id,
      driverId: drivers[0].id,
      vehicleId: vehicles[0].id,
      createdByUserId: dispatcherUser.id,
      pickupDateScheduled: orders[2].pickupDate,
      deliveryDateScheduled: orders[2].deliveryDate,
      status: "ASSIGNED",
      notes: "[TEST DATA] Dispatch created for demo (seed)",
    },
  });

  // Dispatch for IN_TRANSIT order (ORD-...-0004)
  const transitDispatch = await prisma.dispatch.create({
    data: {
      organizationId: organization.id,
      dispatchNumber: "DSP-000002",
      orderId: orders[3].id,
      driverId: drivers[1].id,
      vehicleId: vehicles[1].id,
      createdByUserId: dispatcherUser.id,
      pickupDateScheduled: orders[3].pickupDate,
      deliveryDateScheduled: orders[3].deliveryDate,
      status: "IN_TRANSIT",
      pickupDateActual: days(-1),
      notes: "[TEST DATA] Currently en route (seed)",
    },
  });

  // Dispatch for DELIVERED order (ORD-...-0005)
  await prisma.dispatch.create({
    data: {
      organizationId: organization.id,
      dispatchNumber: "DSP-000003",
      orderId: orders[4].id,
      driverId: drivers[2].id,
      vehicleId: vehicles[2].id,
      createdByUserId: dispatcherUser.id,
      pickupDateScheduled: orders[4].pickupDate,
      deliveryDateScheduled: orders[4].deliveryDate,
      status: "DELIVERED",
      pickupDateActual: days(-10),
      deliveryDateActual: days(-8),
      notes: "[TEST DATA] Delivered on time (seed)",
    },
  });

  // Add status history for the IN_TRANSIT dispatch
  await Promise.all([
    prisma.dispatchStatusHistory.create({
      data: {
        organizationId: organization.id,
        dispatchId: transitDispatch.id,
        status: "DRAFT",
        note: "Dispatch created (seed)",
      },
    }),
    prisma.dispatchStatusHistory.create({
      data: {
        organizationId: organization.id,
        dispatchId: transitDispatch.id,
        status: "ASSIGNED",
        note: "Driver and vehicle assigned (seed)",
      },
    }),
    prisma.dispatchStatusHistory.create({
      data: {
        organizationId: organization.id,
        dispatchId: transitDispatch.id,
        status: "EN_ROUTE_TO_PICKUP",
        note: "En route to pickup location (seed)",
      },
    }),
    prisma.dispatchStatusHistory.create({
      data: {
        organizationId: organization.id,
        dispatchId: transitDispatch.id,
        status: "AT_PICKUP",
        note: "Arrived at pickup location (seed)",
      },
    }),
    prisma.dispatchStatusHistory.create({
      data: {
        organizationId: organization.id,
        dispatchId: transitDispatch.id,
        status: "IN_TRANSIT",
        note: "Cargo picked up, now in transit (seed)",
      },
    }),
  ]);

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
