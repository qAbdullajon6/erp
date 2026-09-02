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
//
// Run:
//   npm run seed:test-org
//
// Reset (wipe the org and all its data, then re-seed):
//   psql $DATABASE_URL -c "DELETE FROM organizations WHERE slug='flowerp-test-logistics';"
//   psql $DATABASE_URL -c "DELETE FROM users WHERE email LIKE '%@flowerp.test';"
//   npm run seed:test-org

import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

const TEST_ORG_SLUG = "flowerp-test-logistics";
const TEST_ORG_NAME = "Trans Logistik Uzbekistan";
const TEST_PASSWORD = "FlowERP-Test-2026!";
const PORTAL_EMAIL = "ali@silkroadtraders.test";

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

async function main() {
  const existing = await prisma.organization.findUnique({
    where: { slug: TEST_ORG_SLUG },
  });
  if (existing) {
    console.log(
      `Test organization "${TEST_ORG_NAME}" already exists (id=${existing.id}). ` +
        "Refusing to create a duplicate. To reseed from scratch, delete it AND its users first:\n" +
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

  const roleUsers: {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    isPlatformAdmin?: boolean;
  }[] = [
    {
      email: "admin@flowerp.test",
      firstName: "Aziz",
      lastName: "Karimov",
      role: "ADMIN",
    },
    {
      email: "platform@flowerp.test",
      firstName: "FlowERP",
      lastName: "Support",
      role: "PLATFORM_ADMIN",
      isPlatformAdmin: true,
    },
    {
      email: "ops-manager@flowerp.test",
      firstName: "Nodir",
      lastName: "Mirzayev",
      role: "OPERATIONS_MANAGER",
    },
    {
      email: "dispatcher@flowerp.test",
      firstName: "Sarvar",
      lastName: "Umarov",
      role: "DISPATCHER",
    },
    {
      email: "accountant@flowerp.test",
      firstName: "Dilnoza",
      lastName: "Yusupova",
      role: "ACCOUNTANT",
    },
    {
      email: "sales@flowerp.test",
      firstName: "Jasur",
      lastName: "Toshmatov",
      role: "SALES_CRM_MANAGER",
    },
    {
      email: "driver@flowerp.test",
      firstName: "Bekzod",
      lastName: "Yusupov",
      role: "DRIVER",
    },
  ];

  const usersByRole = new Map<string, { id: string }>();
  for (const roleUser of roleUsers) {
    const user = await prisma.user.create({
      data: {
        email: roleUser.email,
        firstName: roleUser.firstName,
        lastName: roleUser.lastName,
        passwordHash,
        isPlatformAdmin: roleUser.isPlatformAdmin ?? false,
      },
    });
    usersByRole.set(roleUser.role, user);
    await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: (roleUser.role === "PLATFORM_ADMIN"
          ? "ADMIN"
          : roleUser.role) as never,
      },
    });
  }
  const adminUser = usersByRole.get("ADMIN")!;
  const dispatcherUser = usersByRole.get("DISPATCHER")!;

  // drivers[0] (Bekzod) is linked to driver@flowerp.test so the driver workspace
  // has a real, non-empty demo. Other drivers intentionally have no linked login.
  const drivers = await Promise.all(
    [
      {
        employeeCode: "EMP-0001",
        firstName: "Bekzod",
        lastName: "Yusupov",
        phone: "+998901110001",
        licenseNumber: "AA1234567",
        licenseExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days — triggers expiry warning
        userId: usersByRole.get("DRIVER")!.id,
      },
      {
        employeeCode: "EMP-0002",
        firstName: "Shohruh",
        lastName: "Toshmatov",
        phone: "+998901110002",
        licenseNumber: "AA2345678",
      },
      {
        employeeCode: "EMP-0003",
        firstName: "Dilnoza",
        lastName: "Ergasheva",
        phone: "+998901110003",
        licenseNumber: "AA3456789",
      },
    ].map((d) =>
      prisma.driver.create({ data: { organizationId: organization.id, ...d } }),
    ),
  );

  const vehicles = await Promise.all(
    [
      {
        vehicleCode: "VEH-0001",
        plateNumber: "01A111AA",
        type: "truck",
        capacityKg: 5000,
        capacityM3: 25,
        make: "Isuzu",
        model: "NPR",
        year: 2021,
        insuranceExpiry: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days — triggers insurance warning
      },
      {
        vehicleCode: "VEH-0002",
        plateNumber: "01A222BB",
        type: "van",
        capacityKg: 1200,
        capacityM3: 8,
        make: "Ford",
        model: "Transit",
        year: 2022,
        inspectionExpiry: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 1 day — triggers inspection warning
      },
      {
        vehicleCode: "VEH-0003",
        plateNumber: "01A333CC",
        type: "refrigerated truck",
        capacityKg: 3000,
        capacityM3: 15,
        make: "Hyundai",
        model: "Mighty",
        year: 2020,
      },
    ].map((v) =>
      prisma.vehicle.create({
        data: { organizationId: organization.id, ...v },
      }),
    ),
  );

  // --- GPS position for the live in-transit vehicle (VEH-0002, Ford Transit)
  // Midpoint on Tashkent → Bukhara highway (near Navoi, roughly halfway)
  await prisma.gpsPosition.create({
    data: {
      organizationId: organization.id,
      vehicleId: vehicles[1].id,
      driverId: drivers[1].id,
      recordedAt: new Date(),
      receivedAt: new Date(),
      latitude: 40.0842,
      longitude: 65.3791,
      speedKph: 87,
      heading: 270, // heading west (Tashkent → Bukhara)
    },
  });

  const customers = await Promise.all(
    [
      {
        customerCode: "CUS-0001",
        companyName: "Silk Road Traders",
        contactName: "Ali Rahimov",
        email: PORTAL_EMAIL,
        phone: "+998901220001",
        city: "Tashkent",
        country: "Uzbekistan",
        address: "Amir Temur ko'chasi 108, Tashkent",
        creditLimit: 20000,
        paymentTerms: "NET_30" as const,
      },
      {
        customerCode: "CUS-0002",
        companyName: "Bukhara Foods",
        contactName: "Malika Yusupova",
        email: "malika@bukharafoods.test",
        phone: "+998901220002",
        city: "Bukhara",
        country: "Uzbekistan",
        address: "Lyabi-Hauz ko'chasi 3, Bukhara",
        creditLimit: 12000,
        paymentTerms: "NET_15" as const,
      },
      {
        customerCode: "CUS-0003",
        companyName: "Andijan Textiles",
        contactName: "Farrukh Islomov",
        email: "farrukh@andijantextiles.test",
        phone: "+998901220003",
        city: "Andijan",
        country: "Uzbekistan",
        address: "Mustaqillik ko'chasi 7, Andijan",
        creditLimit: 8000,
        paymentTerms: "NET_45" as const,
      },
    ].map((c) =>
      prisma.customer.create({
        data: { organizationId: organization.id, ...c },
      }),
    ),
  );

  // Customer portal account for CUS-0001 (Silk Road Traders) so the customer
  // portal login can be demonstrated: ali@silkroadtraders.test / FlowERP-Test-2026!
  await prisma.customerPortalAccount.create({
    data: {
      organizationId: organization.id,
      customerId: customers[0].id,
      email: PORTAL_EMAIL,
      passwordHash,
      status: "ACTIVE",
      language: "en",
      timezone: "Asia/Tashkent",
    },
  });

  const now = Date.now();
  const days = (n: number) => new Date(now + n * 24 * 60 * 60 * 1000);
  const currentMonthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const prevMonthLabel = new Date(now - 30 * 24 * 60 * 60 * 1000).toLocaleString('en-US', { month: 'long' });

  type SeedOrder = {
    orderNumber: string;
    customerId: string;
    pickupAddress: string;
    pickupCity: string;
    deliveryAddress: string;
    deliveryCity: string;
    pickupDate: Date;
    deliveryDate: Date;
    cargoDescription: string;
    cargoWeightKg: number;
    cargoVolumeM3: number;
    price: number;
    freightCharge?: number;
    fuelSurcharge?: number;
    otherCharges?: number;
    status:
      | "DRAFT"
      | "PENDING"
      | "ASSIGNED"
      | "PICKED_UP"
      | "IN_TRANSIT"
      | "DELIVERED"
      | "CANCELLED";
    driverId?: string;
    vehicleId?: string;
    deliveredAt?: Date;
    cancelledAt?: Date;
    deliveryInstructions?: string;
    history: { status: string; note: string }[];
  };

  const year = new Date().getUTCFullYear();

  const seedOrders: SeedOrder[] = [
    {
      orderNumber: `ORD-${year}-0001`,
      customerId: customers[0].id,
      pickupAddress: "Amir Temur ko'chasi 108, Tashkent",
      pickupCity: "Tashkent",
      deliveryAddress: "Registon ko'chasi 15, Samarkand",
      deliveryCity: "Samarkand",
      pickupDate: days(5),
      deliveryDate: days(6),
      cargoDescription: "General cargo — consumer electronics, 48 cartons",
      cargoWeightKg: 620,
      cargoVolumeM3: 4.2,
      price: 450,
      freightCharge: 400,
      fuelSurcharge: 35,
      otherCharges: 15,
      status: "DRAFT",
      history: [{ status: "DRAFT", note: "Order created" }],
    },
    {
      orderNumber: `ORD-${year}-0002`,
      customerId: customers[1].id,
      pickupAddress: "Lyabi-Hauz ko'chasi 3, Bukhara",
      pickupCity: "Bukhara",
      deliveryAddress: "Yunusobod ko'chasi 55, Tashkent",
      deliveryCity: "Tashkent",
      pickupDate: days(3),
      deliveryDate: days(4),
      cargoDescription:
        "Packaged food goods — dried fruit, 240 kg, temperature-stable",
      cargoWeightKg: 240,
      cargoVolumeM3: 1.8,
      price: 620,
      freightCharge: 550,
      fuelSurcharge: 45,
      otherCharges: 25,
      status: "PENDING",
      history: [
        { status: "DRAFT", note: "Order created" },
        { status: "PENDING", note: "Ready for dispatch" },
      ],
    },
    {
      orderNumber: `ORD-${year}-0003`,
      customerId: customers[2].id,
      pickupAddress: "Mustaqillik ko'chasi 7, Andijan",
      pickupCity: "Andijan",
      deliveryAddress: "Amir Temur ko'chasi 1, Tashkent",
      deliveryCity: "Tashkent",
      pickupDate: days(2),
      deliveryDate: days(3),
      cargoDescription: "Textile rolls — cotton fabric, 18 rolls, 480 kg",
      cargoWeightKg: 480,
      cargoVolumeM3: 6.0,
      price: 800,
      status: "ASSIGNED",
      driverId: drivers[0].id,
      vehicleId: vehicles[0].id,
      deliveryInstructions:
        "Call warehouse manager 30 minutes before arrival. Gate code: 4821.",
      history: [
        { status: "DRAFT", note: "Order created" },
        { status: "PENDING", note: "Ready for dispatch" },
        {
          status: "ASSIGNED",
          note: "Driver Bekzod Yusupov assigned — awaiting acceptance",
        },
      ],
    },
    {
      // This is the demo "live" shipment — Silk Road Traders can track it in the portal
      orderNumber: `ORD-${year}-0004`,
      customerId: customers[0].id,
      pickupAddress: "Amir Temur ko'chasi 108, Tashkent",
      pickupCity: "Tashkent",
      deliveryAddress: "Hamza ko'chasi 22, Bukhara",
      deliveryCity: "Bukhara",
      pickupDate: days(-1),
      deliveryDate: days(1),
      cargoDescription: "Industrial spare parts — 3 pallets, steel components",
      cargoWeightKg: 1400,
      cargoVolumeM3: 7.5,
      price: 950,
      status: "IN_TRANSIT",
      driverId: drivers[1].id,
      vehicleId: vehicles[1].id,
      deliveryInstructions:
        "Unload at Dock B. Forklift available. Contact: +998901880022.",
      history: [
        { status: "DRAFT", note: "Order created" },
        { status: "PENDING", note: "Ready for dispatch" },
        { status: "ASSIGNED", note: "Driver Shohruh Toshmatov assigned" },
        { status: "PICKED_UP", note: "Cargo picked up at Tashkent warehouse" },
        { status: "IN_TRANSIT", note: "En route to Bukhara via Navoi" },
      ],
    },
    {
      orderNumber: `ORD-${year}-0005`,
      customerId: customers[1].id,
      pickupAddress: "Lyabi-Hauz ko'chasi 3, Bukhara",
      pickupCity: "Bukhara",
      deliveryAddress: "Mustaqillik ko'chasi 7, Andijan",
      deliveryCity: "Andijan",
      pickupDate: days(-10),
      deliveryDate: days(-8),
      cargoDescription: "Packaged spices and condiments — 120 boxes",
      cargoWeightKg: 360,
      cargoVolumeM3: 2.8,
      price: 1100,
      status: "DELIVERED",
      driverId: drivers[2].id,
      vehicleId: vehicles[2].id,
      deliveredAt: days(-8),
      history: [
        { status: "DRAFT", note: "Order created" },
        { status: "PENDING", note: "Ready for dispatch" },
        { status: "ASSIGNED", note: "Driver Dilnoza Ergasheva assigned" },
        { status: "PICKED_UP", note: "Cargo picked up" },
        { status: "IN_TRANSIT", note: "En route" },
        { status: "DELIVERED", note: "Delivered and POD collected" },
      ],
    },
    {
      orderNumber: `ORD-${year}-0006`,
      customerId: customers[2].id,
      pickupAddress: "Mustaqillik ko'chasi 7, Andijan",
      pickupCity: "Andijan",
      deliveryAddress: "Registon ko'chasi 15, Samarkand",
      deliveryCity: "Samarkand",
      pickupDate: days(-5),
      deliveryDate: days(-3),
      cargoDescription: "Machinery parts — cancelled by customer request",
      cargoWeightKg: 850,
      cargoVolumeM3: 5.5,
      price: 500,
      status: "CANCELLED",
      cancelledAt: days(-4),
      history: [
        { status: "DRAFT", note: "Order created" },
        { status: "PENDING", note: "Ready for dispatch" },
        {
          status: "CANCELLED",
          note: "Customer cancelled — equipment no longer needed",
        },
      ],
    },
    {
      // Deliberately overdue and unassigned — shows up in the dispatcher's work queue
      orderNumber: `ORD-${year}-0007`,
      customerId: customers[0].id,
      pickupAddress: "Amir Temur ko'chasi 108, Tashkent",
      pickupCity: "Tashkent",
      deliveryAddress: "Ferghana ko'chasi 45, Andijan",
      deliveryCity: "Andijan",
      pickupDate: days(-6),
      deliveryDate: days(-2),
      cargoDescription: "Retail merchandise — 6 pallets, mixed goods",
      cargoWeightKg: 2100,
      cargoVolumeM3: 12.0,
      price: 700,
      status: "PENDING",
      history: [
        { status: "DRAFT", note: "Order created" },
        {
          status: "PENDING",
          note: "Ready for dispatch — awaiting driver assignment",
        },
      ],
    },
    {
      // Re-dispatch scenario: initial delivery failed; order is back to PENDING
      // The failed dispatch (DSP-000004) is created separately below
      orderNumber: `ORD-${year}-0008`,
      customerId: customers[1].id,
      pickupAddress: "Navoi ko'chasi 18, Navoi",
      pickupCity: "Navoi",
      deliveryAddress: "Hamza ko'chasi 22, Bukhara",
      deliveryCity: "Bukhara",
      pickupDate: days(-3),
      deliveryDate: days(-1),
      cargoDescription: "Pharmaceutical supplies — refrigerated, 40 boxes",
      cargoWeightKg: 180,
      cargoVolumeM3: 1.2,
      price: 820,
      status: "PENDING", // back to PENDING after failed delivery
      history: [
        { status: "DRAFT", note: "Order created" },
        { status: "PENDING", note: "Ready for dispatch" },
        { status: "ASSIGNED", note: "Driver assigned" },
        { status: "IN_TRANSIT", note: "En route to delivery" },
        {
          status: "PENDING",
          note: "Delivery failed — recipient unavailable. Awaiting re-dispatch.",
        },
      ],
    },
    {
      // Low-margin order for negative profit demo
      orderNumber: `ORD-${year}-0009`,
      customerId: customers[1].id,
      pickupAddress: "Registon ko'chasi 15, Samarkand",
      pickupCity: "Samarkand",
      deliveryAddress: "Hamza ko'chasi 22, Bukhara",
      deliveryCity: "Bukhara",
      pickupDate: days(-8),
      deliveryDate: days(-7),
      cargoDescription: "Miscellaneous shipment — low revenue run",
      cargoWeightKg: 90,
      cargoVolumeM3: 0.8,
      price: 100,
      status: "DELIVERED",
      driverId: drivers[0].id,
      vehicleId: vehicles[1].id,
      deliveredAt: days(-7),
      history: [
        { status: "DRAFT", note: "Order created" },
        { status: "PENDING", note: "Ready for dispatch" },
        { status: "ASSIGNED", note: "Driver assigned" },
        { status: "IN_TRANSIT", note: "En route" },
        { status: "DELIVERED", note: "Delivered" },
      ],
    },
  ];

  const orders: {
    id: string;
    orderNumber: string;
    pickupDate: Date;
    deliveryDate: Date;
  }[] = [];
  for (const seedOrder of seedOrders) {
    const order = await prisma.order.create({
      data: {
        organizationId: organization.id,
        orderNumber: seedOrder.orderNumber,
        customerId: seedOrder.customerId,
        pickupAddress: seedOrder.pickupAddress,
        pickupCity: seedOrder.pickupCity,
        pickupDate: seedOrder.pickupDate,
        deliveryAddress: seedOrder.deliveryAddress,
        deliveryCity: seedOrder.deliveryCity,
        deliveryDate: seedOrder.deliveryDate,
        cargoDescription: seedOrder.cargoDescription,
        cargoWeightKg: seedOrder.cargoWeightKg,
        cargoVolumeM3: seedOrder.cargoVolumeM3,
        price: seedOrder.price,
        freightCharge: seedOrder.freightCharge ?? null,
        fuelSurcharge: seedOrder.fuelSurcharge ?? null,
        otherCharges: seedOrder.otherCharges ?? null,
        currency: "USD",
        status: seedOrder.status,
        driverId: seedOrder.driverId ?? null,
        vehicleId: seedOrder.vehicleId ?? null,
        deliveredAt: seedOrder.deliveredAt ?? null,
        cancelledAt: seedOrder.cancelledAt ?? null,
        deliveryInstructions: seedOrder.deliveryInstructions ?? null,
      },
    });
    orders.push(order);

    for (const entry of seedOrder.history) {
      await prisma.orderStatusHistory.create({
        data: {
          organizationId: organization.id,
          orderId: order.id,
          status: entry.status as never,
          changedByUserId: adminUser.id,
          note: entry.note,
        },
      });
    }
  }

  // orders[3] = IN_TRANSIT order (ORD-...-0004, Tashkent→Bukhara)
  // Add an intermediate OrderStop at Navoi (halfway on the route)
  await prisma.orderStop.create({
    data: {
      organizationId: organization.id,
      orderId: orders[3].id,
      stopIndex: 1,
      address: "Navoi ko'chasi 18, Navoi",
      city: "Navoi",
      countryCode: "UZ",
      placeName: "Navoi Distribution Center",
      contactName: "Asliddin Nazarov",
      contactPhone: "+998901990033",
      instructions:
        "Drop off 2 pallets, receive signed waybill. 30-minute stop.",
      windowStart: days(0),
      windowEnd: days(0),
    },
  });

  // --- Dispatches ---

  // DSP-000001: ASSIGNED (ORD-...-0003, Bekzod, Andijan→Tashkent)
  // driverAcceptanceStatus defaults to PENDING — driver sees this and can accept in the demo
  const assignedDispatch = await prisma.dispatch.create({
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
      notes:
        "Standard assignment — driver to confirm pickup window with warehouse.",
    },
  });
  await prisma.dispatchStatusHistory.createMany({
    data: [
      {
        organizationId: organization.id,
        dispatchId: assignedDispatch.id,
        status: "DRAFT",
        changedByUserId: dispatcherUser.id,
        note: "Dispatch created",
      },
      {
        organizationId: organization.id,
        dispatchId: assignedDispatch.id,
        status: "ASSIGNED",
        changedByUserId: dispatcherUser.id,
        note: "Driver and vehicle assigned",
      },
    ],
  });
  // DispatchStops for DSP-000001
  await prisma.dispatchStop.createMany({
    data: [
      {
        organizationId: organization.id,
        dispatchId: assignedDispatch.id,
        stopIndex: 0,
        stopType: "PICKUP",
        address: "Mustaqillik ko'chasi 7, Andijan",
        city: "Andijan",
        countryCode: "UZ",
        contactName: "Farrukh Islomov",
        contactPhone: "+998901220003",
        instructions: "Loading dock open 08:00–18:00.",
      },
      {
        organizationId: organization.id,
        dispatchId: assignedDispatch.id,
        stopIndex: 1,
        stopType: "DELIVERY",
        address: "Amir Temur ko'chasi 1, Tashkent",
        city: "Tashkent",
        countryCode: "UZ",
        instructions:
          "Call warehouse manager 30 minutes before arrival. Gate code: 4821.",
      },
    ],
  });

  // DSP-000002: IN_TRANSIT (ORD-...-0004, Shohruh, Tashkent→Bukhara via Navoi)
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
      driverAcceptanceStatus: "ACCEPTED",
      driverAcceptedAt: days(-1),
      pickupDateActual: days(-1),
      notes:
        "Priority shipment — customer confirmed receipt window 14:00–18:00 on delivery date.",
    },
  });
  await prisma.dispatchStatusHistory.createMany({
    data: [
      {
        organizationId: organization.id,
        dispatchId: transitDispatch.id,
        status: "DRAFT",
        changedByUserId: dispatcherUser.id,
        note: "Dispatch created",
      },
      {
        organizationId: organization.id,
        dispatchId: transitDispatch.id,
        status: "ASSIGNED",
        changedByUserId: dispatcherUser.id,
        note: "Driver Shohruh Toshmatov assigned",
      },
      {
        organizationId: organization.id,
        dispatchId: transitDispatch.id,
        status: "EN_ROUTE_TO_PICKUP",
        changedByUserId: dispatcherUser.id,
        note: "Driver en route to Tashkent warehouse",
      },
      {
        organizationId: organization.id,
        dispatchId: transitDispatch.id,
        status: "AT_PICKUP",
        changedByUserId: dispatcherUser.id,
        note: "Arrived at pickup",
      },
      {
        organizationId: organization.id,
        dispatchId: transitDispatch.id,
        status: "IN_TRANSIT",
        changedByUserId: dispatcherUser.id,
        note: "Cargo loaded — en route to Bukhara via Navoi",
      },
    ],
  });
  // DispatchStops for DSP-000002 (pickup + intermediate + delivery)
  await prisma.dispatchStop.createMany({
    data: [
      {
        organizationId: organization.id,
        dispatchId: transitDispatch.id,
        stopIndex: 0,
        stopType: "PICKUP",
        address: "Amir Temur ko'chasi 108, Tashkent",
        city: "Tashkent",
        countryCode: "UZ",
        contactName: "Ali Rahimov",
        contactPhone: "+998901220001",
        instructions: "Gate 3, dock level. Forklift provided.",
        completedAt: days(-1),
      },
      {
        organizationId: organization.id,
        dispatchId: transitDispatch.id,
        stopIndex: 1,
        stopType: "INTERMEDIATE",
        address: "Navoi ko'chasi 18, Navoi",
        city: "Navoi",
        countryCode: "UZ",
        placeName: "Navoi Distribution Center",
        contactName: "Asliddin Nazarov",
        contactPhone: "+998901990033",
        instructions:
          "Drop off 2 pallets, collect signed waybill. ~30 min stop.",
      },
      {
        organizationId: organization.id,
        dispatchId: transitDispatch.id,
        stopIndex: 2,
        stopType: "DELIVERY",
        address: "Hamza ko'chasi 22, Bukhara",
        city: "Bukhara",
        countryCode: "UZ",
        instructions:
          "Unload at Dock B. Forklift available. Contact: +998901880022.",
      },
    ],
  });

  // RTE-0001: the presenter-facing execution view for the live shipment.
  // It mirrors DSP-000002's Tashkent → Navoi → Bukhara journey and places
  // the seeded GPS position at the current (Navoi) stop. The route is already
  // in progress so recording never requires planning or state changes first.
  await prisma.route.create({
    data: {
      organizationId: organization.id,
      routeNumber: "RTE-0001",
      status: "IN_PROGRESS",
      driverId: drivers[1].id,
      vehicleId: vehicles[1].id,
      plannedDate: days(0),
      startTime: days(-1),
      notes: "Priority freight run — Tashkent to Bukhara via Navoi Distribution Center.",
      createdByUserId: dispatcherUser.id,
      stops: {
        create: [
          {
            organizationId: organization.id,
            sequence: 1,
            orderId: orders[3].id,
            label: "Pickup — Silk Road Traders",
            address: "Amir Temur ko'chasi 108, Tashkent",
            city: "Tashkent",
            lat: 41.3111,
            lng: 69.2797,
            status: "COMPLETED",
            notes: "Cargo loaded for DSP-000002.",
          },
          {
            organizationId: organization.id,
            sequence: 2,
            orderId: orders[3].id,
            dispatchId: transitDispatch.id,
            label: "Navoi Distribution Center",
            address: "Navoi ko'chasi 18, Navoi",
            city: "Navoi",
            lat: 40.0842,
            lng: 65.3791,
            status: "PENDING",
            notes: "Intermediate drop-off and signed-waybill collection.",
          },
          {
            organizationId: organization.id,
            sequence: 3,
            orderId: orders[3].id,
            label: "Delivery — Bukhara",
            address: "Hamza ko'chasi 22, Bukhara",
            city: "Bukhara",
            lat: 39.7681,
            lng: 64.4556,
            status: "PENDING",
            notes: "Final delivery window: 14:00–18:00.",
          },
        ],
      },
    },
  });

  // DSP-000003: DELIVERED (ORD-...-0005, Dilnoza, Bukhara→Andijan)
  const deliveredDispatch = await prisma.dispatch.create({
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
      driverAcceptanceStatus: "ACCEPTED",
      driverAcceptedAt: days(-10),
      pickupDateActual: days(-10),
      deliveryDateActual: days(-8),
      notes: "Delivered on schedule.",
    },
  });
  await prisma.dispatchStatusHistory.createMany({
    data: [
      {
        organizationId: organization.id,
        dispatchId: deliveredDispatch.id,
        status: "DRAFT",
        changedByUserId: dispatcherUser.id,
        note: "Dispatch created",
      },
      {
        organizationId: organization.id,
        dispatchId: deliveredDispatch.id,
        status: "ASSIGNED",
        changedByUserId: dispatcherUser.id,
        note: "Driver Dilnoza Ergasheva assigned",
      },
      {
        organizationId: organization.id,
        dispatchId: deliveredDispatch.id,
        status: "EN_ROUTE_TO_PICKUP",
        changedByUserId: dispatcherUser.id,
        note: "En route to Bukhara",
      },
      {
        organizationId: organization.id,
        dispatchId: deliveredDispatch.id,
        status: "AT_PICKUP",
        changedByUserId: dispatcherUser.id,
        note: "At pickup location",
      },
      {
        organizationId: organization.id,
        dispatchId: deliveredDispatch.id,
        status: "IN_TRANSIT",
        changedByUserId: dispatcherUser.id,
        note: "En route to Andijan",
      },
      {
        organizationId: organization.id,
        dispatchId: deliveredDispatch.id,
        status: "ARRIVED_AT_DELIVERY",
        changedByUserId: dispatcherUser.id,
        note: "Arrived at Andijan",
      },
      {
        organizationId: organization.id,
        dispatchId: deliveredDispatch.id,
        status: "DELIVERED",
        changedByUserId: dispatcherUser.id,
        note: "Delivered. POD collected.",
      },
    ],
  });
  // DispatchStops for DSP-000003
  await prisma.dispatchStop.createMany({
    data: [
      {
        organizationId: organization.id,
        dispatchId: deliveredDispatch.id,
        stopIndex: 0,
        stopType: "PICKUP",
        address: "Lyabi-Hauz ko'chasi 3, Bukhara",
        city: "Bukhara",
        countryCode: "UZ",
        completedAt: days(-10),
      },
      {
        organizationId: organization.id,
        dispatchId: deliveredDispatch.id,
        stopIndex: 1,
        stopType: "DELIVERY",
        address: "Mustaqillik ko'chasi 7, Andijan",
        city: "Andijan",
        countryCode: "UZ",
        completedAt: days(-8),
      },
    ],
  });

  // POD proof for the DELIVERED dispatch
  await prisma.dispatchDeliveryProof.create({
    data: {
      organizationId: organization.id,
      dispatchId: deliveredDispatch.id,
      orderId: orders[4].id,
      uploadedByUserId: adminUser.id,
      driverId: drivers[2].id,
      type: "PHOTO",
      fileName: "pod-delivery-confirmation.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 142_400,
      storagePath: "demo/pod/dsp-000003/pod-delivery-confirmation.jpg",
      receiverName: "Farrukh Islomov",
      receiverPhone: "+998901220003",
      notes: "Package in good condition. Signed by warehouse manager.",
    },
  });

  // DSP-000004: DELIVERY_FAILED (ORD-...-0008, re-dispatch scenario)
  // This dispatch shows the full re-dispatch flow in the work queue
  const failedDispatch = await prisma.dispatch.create({
    data: {
      organizationId: organization.id,
      dispatchNumber: "DSP-000004",
      orderId: orders[7].id, // ORD-...-0008
      driverId: drivers[2].id,
      vehicleId: vehicles[2].id,
      createdByUserId: dispatcherUser.id,
      pickupDateScheduled: orders[7].pickupDate,
      deliveryDateScheduled: orders[7].deliveryDate,
      status: "DELIVERY_FAILED",
      driverAcceptanceStatus: "ACCEPTED",
      driverAcceptedAt: days(-3),
      pickupDateActual: days(-3),
      failureReason: "CUSTOMER_UNAVAILABLE",
      failureNotes:
        "Recipient not present at delivery address. No answer on phone. Left notice.",
      failedAt: days(-1),
      notes:
        "First delivery attempt failed. Order returned to queue for re-dispatch.",
    },
  });
  await prisma.dispatchStatusHistory.createMany({
    data: [
      {
        organizationId: organization.id,
        dispatchId: failedDispatch.id,
        status: "DRAFT",
        changedByUserId: dispatcherUser.id,
        note: "Dispatch created",
      },
      {
        organizationId: organization.id,
        dispatchId: failedDispatch.id,
        status: "ASSIGNED",
        changedByUserId: dispatcherUser.id,
        note: "Driver Dilnoza Ergasheva assigned",
      },
      {
        organizationId: organization.id,
        dispatchId: failedDispatch.id,
        status: "EN_ROUTE_TO_PICKUP",
        changedByUserId: dispatcherUser.id,
        note: "En route to Navoi",
      },
      {
        organizationId: organization.id,
        dispatchId: failedDispatch.id,
        status: "AT_PICKUP",
        changedByUserId: dispatcherUser.id,
        note: "At Navoi pickup",
      },
      {
        organizationId: organization.id,
        dispatchId: failedDispatch.id,
        status: "IN_TRANSIT",
        changedByUserId: dispatcherUser.id,
        note: "En route to Bukhara",
      },
      {
        organizationId: organization.id,
        dispatchId: failedDispatch.id,
        status: "ARRIVED_AT_DELIVERY",
        changedByUserId: dispatcherUser.id,
        note: "Arrived at delivery address",
      },
      {
        organizationId: organization.id,
        dispatchId: failedDispatch.id,
        status: "DELIVERY_FAILED",
        changedByUserId: dispatcherUser.id,
        note: "Delivery failed — recipient unavailable",
      },
    ],
  });
  await prisma.dispatchStop.createMany({
    data: [
      {
        organizationId: organization.id,
        dispatchId: failedDispatch.id,
        stopIndex: 0,
        stopType: "PICKUP",
        address: "Navoi ko'chasi 18, Navoi",
        city: "Navoi",
        countryCode: "UZ",
        completedAt: days(-3),
      },
      {
        organizationId: organization.id,
        dispatchId: failedDispatch.id,
        stopIndex: 1,
        stopType: "DELIVERY",
        address: "Hamza ko'chasi 22, Bukhara",
        city: "Bukhara",
        countryCode: "UZ",
        failedAt: days(-1),
        failureReason: "Recipient unavailable — no answer on phone or doorbell",
        failureNotes: "Left notice. Cargo returned to van.",
      },
    ],
  });

  // --- Finance ---

  const invoiceYear = new Date().getUTCFullYear();

  async function createInvoice(params: {
    invoiceNumber: string;
    customerId: string;
    orderId?: string;
    dueDate?: Date;
    status:
      "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
    lineItems: { description: string; quantity: number; unitPrice: number }[];
    discountAmount?: number;
    taxAmount?: number;
    paidAmount?: number;
    cancelledAt?: Date;
  }) {
    const subtotal = params.lineItems.reduce(
      (sum, li) => sum + li.quantity * li.unitPrice,
      0,
    );
    const discountAmount = params.discountAmount ?? 0;
    const taxAmount = params.taxAmount ?? 0;
    const totalAmount = subtotal - discountAmount + taxAmount;
    const paidAmount = params.paidAmount ?? 0;
    return prisma.invoice.create({
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
  }

  // INV-0001: PAID for the DELIVERED order
  const deliveredOrder = orders[4]; // ORD-...-0005
  const paidInvoice = await createInvoice({
    invoiceNumber: `INV-${invoiceYear}-0001`,
    customerId: customers[1].id,
    orderId: deliveredOrder.id,
    status: "PAID",
    lineItems: [
      {
        description: `Freight — ${deliveredOrder.orderNumber}`,
        quantity: 1,
        unitPrice: 1100,
      },
    ],
    paidAmount: 1100,
  });
  await prisma.payment.create({
    data: {
      organizationId: organization.id,
      invoiceId: paidInvoice.id,
      amount: 1100,
      method: "BANK_TRANSFER",
      reference: "WIRE-20260801-001",
      notes: "Payment received in full",
    },
  });

  // INV-0002: PARTIALLY_PAID
  const partialInvoice = await createInvoice({
    invoiceNumber: `INV-${invoiceYear}-0002`,
    customerId: customers[0].id,
    dueDate: days(10),
    status: "PARTIALLY_PAID",
    lineItems: [
      {
        description: `Monthly logistics retainer — ${currentMonthLabel}`,
        quantity: 1,
        unitPrice: 900,
      },
    ],
    paidAmount: 400,
  });
  await prisma.payment.create({
    data: {
      organizationId: organization.id,
      invoiceId: partialInvoice.id,
      amount: 400,
      method: "CARD",
      notes: "Partial payment — remainder pending",
    },
  });

  // INV-0003: OVERDUE
  await createInvoice({
    invoiceNumber: `INV-${invoiceYear}-0003`,
    customerId: customers[2].id,
    dueDate: days(-15),
    status: "OVERDUE",
    lineItems: [
      {
        description: `Freight — Andijan Textiles, ${prevMonthLabel} runs`,
        quantity: 1,
        unitPrice: 640,
      },
    ],
  });

  // INV-0004: DRAFT
  await createInvoice({
    invoiceNumber: `INV-${invoiceYear}-0004`,
    customerId: customers[0].id,
    status: "DRAFT",
    lineItems: [
      {
        description: `Freight — ${orders[3].orderNumber} (in transit)`,
        quantity: 1,
        unitPrice: 950,
      },
      {
        description: "Surcharge — priority handling",
        quantity: 1,
        unitPrice: 50,
      },
    ],
    discountAmount: 20,
  });

  // INV-0005: CANCELLED
  await createInvoice({
    invoiceNumber: `INV-${invoiceYear}-0005`,
    customerId: customers[1].id,
    status: "CANCELLED",
    lineItems: [
      {
        description: `Freight — cancelled order ${orders[5].orderNumber}`,
        quantity: 1,
        unitPrice: 300,
      },
    ],
    cancelledAt: days(-2),
  });

  // INV-0006: SENT — near credit limit for customer[0]
  await createInvoice({
    invoiceNumber: `INV-${invoiceYear}-0006`,
    customerId: customers[0].id,
    dueDate: days(15),
    status: "SENT",
    lineItems: [
      {
        description: "Freight — bulk quarterly contract",
        quantity: 1,
        unitPrice: 16000,
      },
    ],
  });

  // INV-0007: SENT — exceeds credit limit for customer[2]
  await createInvoice({
    invoiceNumber: `INV-${invoiceYear}-0007`,
    customerId: customers[2].id,
    dueDate: days(15),
    status: "SENT",
    lineItems: [
      {
        description: "Freight — large textile shipment",
        quantity: 1,
        unitPrice: 10000,
      },
    ],
  });

  // INV-0008: SENT — due soon (2 days)
  await createInvoice({
    invoiceNumber: `INV-${invoiceYear}-0008`,
    customerId: customers[1].id,
    dueDate: days(2),
    status: "SENT",
    lineItems: [
      {
        description: "Freight — Bukhara Foods express delivery",
        quantity: 1,
        unitPrice: 500,
      },
    ],
  });

  // --- Expenses ---
  await prisma.expense.createMany({
    data: [
      {
        organizationId: organization.id,
        expenseNumber: `EXP-${invoiceYear}-0001`,
        orderId: deliveredOrder.id,
        vehicleId: vehicles[2].id,
        driverId: drivers[2].id,
        category: "FUEL",
        description: "Diesel — Bukhara→Andijan run",
        amount: 150,
        status: "APPROVED",
        approvedByUserId: adminUser.id,
        approvedAt: new Date(),
      },
      {
        organizationId: organization.id,
        expenseNumber: `EXP-${invoiceYear}-0002`,
        orderId: deliveredOrder.id,
        category: "TOLL",
        description: "Highway tolls — Bukhara→Andijan",
        amount: 40,
        status: "PENDING",
      },
      {
        organizationId: organization.id,
        expenseNumber: `EXP-${invoiceYear}-0003`,
        vehicleId: vehicles[0].id,
        category: "MAINTENANCE",
        description: "Scheduled service — Isuzu NPR 50,000 km",
        amount: 300,
        status: "APPROVED",
        approvedByUserId: adminUser.id,
        approvedAt: new Date(),
      },
      {
        organizationId: organization.id,
        expenseNumber: `EXP-${invoiceYear}-0004`,
        driverId: drivers[1].id,
        category: "DRIVER_ADVANCE",
        description: "Cash advance — Shohruh Toshmatov (in-transit trip)",
        amount: 200,
        status: "PENDING",
      },
      {
        organizationId: organization.id,
        expenseNumber: `EXP-${invoiceYear}-0005`,
        vehicleId: vehicles[2].id,
        category: "INSURANCE",
        description: "Annual insurance renewal — rejected duplicate",
        amount: 500,
        status: "REJECTED",
        approvedByUserId: adminUser.id,
        approvedAt: new Date(),
        rejectionReason: "Duplicate submission",
      },
      {
        organizationId: organization.id,
        expenseNumber: `EXP-${invoiceYear}-0006`,
        orderId: orders[8].id, // ORD-...-0009, negative profit
        vehicleId: vehicles[1].id,
        driverId: drivers[0].id,
        category: "FUEL",
        description: "Fuel — low-margin Samarkand→Bukhara run",
        amount: 80,
        status: "APPROVED",
        approvedByUserId: adminUser.id,
        approvedAt: new Date(),
      },
      {
        organizationId: organization.id,
        expenseNumber: `EXP-${invoiceYear}-0007`,
        orderId: orders[8].id,
        category: "TOLL",
        description: "Tolls — Samarkand→Bukhara",
        amount: 50,
        status: "APPROVED",
        approvedByUserId: adminUser.id,
        approvedAt: new Date(),
      },
    ],
  });

  // --- Print demo credentials ---
  console.log(
    `\n✓ Created demo organization "${TEST_ORG_NAME}" (slug: ${TEST_ORG_SLUG})\n`,
  );
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(" DEMO ACCOUNTS — all share password: " + TEST_PASSWORD);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(" Staff portal (/auth/login):");
  for (const roleUser of roleUsers) {
    console.log(`   ${roleUser.email.padEnd(35)} ${roleUser.role}`);
  }
  console.log("");
  console.log(" Customer portal (/portal/login):");
  console.log(`   ${PORTAL_EMAIL.padEnd(35)} CUSTOMER  (Silk Road Traders)`);
  console.log("");
  console.log(" Demo scenario:");
  console.log(
    "   DSP-000001  ASSIGNED       Bekzod Yusupov  | Andijan→Tashkent (awaiting driver acceptance)",
  );
  console.log(
    "   DSP-000002  IN_TRANSIT     Shohruh Toshmatov | Tashkent→Bukhara via Navoi (live GPS)",
  );
  console.log(
    "   RTE-0001     IN_PROGRESS    Ford Transit 01A222BB | Tashkent→Navoi→Bukhara (route execution)",
  );
  console.log(
    "   DSP-000003  DELIVERED      Dilnoza Ergasheva | Bukhara→Andijan (POD collected)",
  );
  console.log(
    "   DSP-000004  DELIVERY_FAILED  ORD-2026-0008   | Navoi→Bukhara (in re-dispatch queue)",
  );
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
