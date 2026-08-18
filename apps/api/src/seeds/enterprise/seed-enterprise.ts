/**
 * Deterministic enterprise-scale seed for FlowERP QA / demos.
 *
 * Adds volume INTO the existing flowerp-test-logistics org (seed-test-org)
 * using CUS-E- / EMP-E- / … prefixes so RC fixtures stay untouched.
 *
 *   npm run seed:enterprise
 *   npm run seed:enterprise -- --force   # wipe + reseed enterprise rows only
 *
 * Reproducible via ENTERPRISE_RNG_SEED — same inputs ⇒ same dataset shape.
 */

import { createHash } from 'node:crypto';
import {
  Prisma,
  PrismaClient,
  type DispatchStatus,
  type InvoiceStatus,
  type NotificationCategory,
  type NotificationSeverity,
  type OrderStatus,
  type PaymentMethod,
} from '@prisma/client';
import * as argon2 from 'argon2';
import {
  CARGO,
  CITIES,
  COMPANY_ROOTS,
  COMPANY_SUFFIXES,
  FIRST_NAMES,
  LAST_NAMES,
  PLATE_REGIONS,
  STREETS,
  VEHICLE_TYPES,
} from './catalog';
import {
  COUNTS,
  ENTERPRISE_RNG_SEED,
  ENTERPRISE_SEED_TAG,
  PREFIX,
  TEST_ORG_SLUG,
  TEST_PASSWORD,
} from './constants';
import { createRng } from './rng';
import { wipeEnterpriseRows } from './wipe';

const prisma = new PrismaClient();

const FORCE = process.argv.includes('--force');

function uuid(label: string): string {
  const h = createHash('sha256').update(`flowerp-enterprise:${label}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function daysFromAnchor(anchor: Date, dayOffset: number, hour = 8): Date {
  const d = new Date(anchor);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed:enterprise refuses to run when NODE_ENV=production');
  }

  const org = await prisma.organization.findUnique({ where: { slug: TEST_ORG_SLUG } });
  if (!org) {
    throw new Error(
      `Organization "${TEST_ORG_SLUG}" not found. Run \`npm run seed:test-org\` first.`,
    );
  }

  const existing = await prisma.customer.count({
    where: { organizationId: org.id, customerCode: { startsWith: PREFIX.customer } },
  });
  if (existing > 0 && !FORCE) {
    console.log(
      `Enterprise seed already present (${existing} customers with ${PREFIX.customer}*). ` +
        'Re-run with --force to wipe enterprise rows and regenerate.',
    );
    return;
  }

  if (FORCE && existing > 0) {
    console.log('Wiping previous enterprise-scale rows…');
    await wipeEnterpriseRows(prisma, org.id);
  }

  const admin = await prisma.user.findUnique({ where: { email: 'admin@flowerp.test' } });
  if (!admin) {
    throw new Error('admin@flowerp.test missing — run seed:test-org first');
  }

  const rng = createRng(ENTERPRISE_RNG_SEED);
  /// Anchor: fixed UTC day so schedules stay stable across runs.
  const anchor = new Date('2026-07-01T00:00:00.000Z');
  const passwordHash = await argon2.hash(TEST_PASSWORD, { type: argon2.argon2id });

  console.log(`Seeding enterprise volume into ${TEST_ORG_SLUG} (v=${ENTERPRISE_SEED_TAG})…`);

  // ── Drivers ──────────────────────────────────────────────────────────
  const driverRows = Array.from({ length: COUNTS.drivers }, (_, i) => {
    const n = i + 1;
    const expired = n <= 12;
    return {
      id: uuid(`driver:${n}`),
      organizationId: org.id,
      employeeCode: `${PREFIX.driver}${pad(n, 4)}`,
      firstName: FIRST_NAMES[n % FIRST_NAMES.length],
      lastName: LAST_NAMES[n % LAST_NAMES.length],
      phone: `+99890${pad(1000000 + n, 7).slice(-7)}`,
      email: `driver-e-${pad(n, 4)}@flowerp.test`,
      status: 'ACTIVE' as const,
      operationalStatus: rng.pick(['AVAILABLE', 'BUSY', 'DRIVING', 'LOADING', 'BREAK', 'OFFLINE'] as const),
      licenseNumber: `AA${pad(1000000 + n, 7)}`,
      licenseExpiry: expired
        ? new Date('2004-05-26T00:00:00.000Z')
        : daysFromAnchor(anchor, 90 + (n % 200)),
    };
  });
  for (const batch of chunked(driverRows, 40)) {
    await prisma.driver.createMany({ data: batch });
  }
  console.log(`  drivers: ${driverRows.length}`);

  // ── Vehicles ─────────────────────────────────────────────────────────
  const vehicleRows = Array.from({ length: COUNTS.vehicles }, (_, i) => {
    const n = i + 1;
    const region = PLATE_REGIONS[n % PLATE_REGIONS.length];
    return {
      id: uuid(`vehicle:${n}`),
      organizationId: org.id,
      vehicleCode: `${PREFIX.vehicle}${pad(n, 4)}`,
      plateNumber: `${region}A${pad(100 + n, 3)}${String.fromCharCode(65 + (n % 26))}${String.fromCharCode(65 + ((n * 3) % 26))}`,
      type: VEHICLE_TYPES[n % VEHICLE_TYPES.length],
      capacityKg: new Prisma.Decimal(3000 + (n % 20) * 500),
      capacityM3: new Prisma.Decimal(12 + (n % 15)),
      status: 'AVAILABLE' as const,
      make: rng.pick(['Isuzu', 'Mercedes', 'MAN', 'Howo', 'GAZ']),
      model: rng.pick(['NPR', 'Actros', 'TGS', 'A7', 'Next']),
      year: 2018 + (n % 7),
      insuranceExpiry: n % 17 === 0 ? daysFromAnchor(anchor, -10) : daysFromAnchor(anchor, 60 + (n % 120)),
      inspectionExpiry: n % 19 === 0 ? daysFromAnchor(anchor, -5) : daysFromAnchor(anchor, 40 + (n % 90)),
    };
  });
  for (const batch of chunked(vehicleRows, 40)) {
    await prisma.vehicle.createMany({ data: batch });
  }
  console.log(`  vehicles: ${vehicleRows.length}`);

  // ── Customers ────────────────────────────────────────────────────────
  const customerRows = Array.from({ length: COUNTS.customers }, (_, i) => {
    const n = i + 1;
    const city = CITIES[n % CITIES.length];
    const company = `${COMPANY_ROOTS[n % COMPANY_ROOTS.length]} ${COMPANY_SUFFIXES[n % COMPANY_SUFFIXES.length]} ${n}`;
    return {
      id: uuid(`customer:${n}`),
      organizationId: org.id,
      customerCode: `${PREFIX.customer}${pad(n, 4)}`,
      companyName: company,
      contactName: `${FIRST_NAMES[n % FIRST_NAMES.length]} ${LAST_NAMES[n % LAST_NAMES.length]}`,
      email: `contact-e-${pad(n, 4)}@${PREFIX.portalEmailDomain}`,
      phone: `+99871${pad(2000000 + n, 7).slice(-7)}`,
      country: 'Uzbekistan',
      city,
      address: `${STREETS[n % STREETS.length]} ${10 + (n % 90)}, ${city}`,
      taxId: `3${pad(100000000 + n, 9)}`,
      paymentTerms: rng.pick(['DUE_ON_RECEIPT', 'NET_15', 'NET_30', 'NET_45'] as const),
      creditLimit: new Prisma.Decimal(5000 + (n % 40) * 1000),
      status: 'ACTIVE' as const,
      deliveryNotes: n % 5 === 0 ? 'Call 30 minutes before arrival' : null,
      internalNotes: ENTERPRISE_SEED_TAG,
    };
  });
  for (const batch of chunked(customerRows, 40)) {
    await prisma.customer.createMany({ data: batch });
  }
  console.log(`  customers: ${customerRows.length}`);

  // ── Portal accounts (subset) ─────────────────────────────────────────
  const portalRows = customerRows.slice(0, COUNTS.portalAccounts).map((c, i) => ({
    id: uuid(`portal:${i + 1}`),
    organizationId: org.id,
    customerId: c.id,
    email: c.email,
    passwordHash,
    status: 'ACTIVE' as const,
    language: 'en',
    timezone: 'Asia/Tashkent',
  }));
  await prisma.customerPortalAccount.createMany({ data: portalRows });
  console.log(`  portal accounts: ${portalRows.length}`);

  // ── Orders ───────────────────────────────────────────────────────────
  const orderStatuses: OrderStatus[] = [
    'PENDING',
    'ASSIGNED',
    'PICKED_UP',
    'IN_TRANSIT',
    'DELIVERED',
    'DELIVERED',
    'CANCELLED',
    'DRAFT',
  ];
  const orderRows = Array.from({ length: COUNTS.orders }, (_, i) => {
    const n = i + 1;
    const customer = customerRows[n % customerRows.length];
    const pickupCity = CITIES[n % CITIES.length];
    const deliveryCity = CITIES[(n + 3) % CITIES.length];
    const pickup = daysFromAnchor(anchor, (n % 60) - 20, 8 + (n % 6));
    const delivery = daysFromAnchor(anchor, (n % 60) - 18, 14 + (n % 6));
    const status = orderStatuses[n % orderStatuses.length];
    const driver = driverRows[n % driverRows.length];
    const vehicle = vehicleRows[n % vehicleRows.length];
    const assigned = status !== 'DRAFT' && status !== 'PENDING' && status !== 'CANCELLED';
    return {
      id: uuid(`order:${n}`),
      organizationId: org.id,
      orderNumber: `${PREFIX.order}${pad(n, 4)}`,
      customerId: customer.id,
      pickupAddress: `${STREETS[n % STREETS.length]} ${n % 80}, ${pickupCity}`,
      pickupCity,
      pickupDate: pickup,
      deliveryAddress: `${STREETS[(n + 2) % STREETS.length]} ${(n * 2) % 90}, ${deliveryCity}`,
      deliveryCity,
      deliveryDate: delivery,
      cargoDescription: CARGO[n % CARGO.length],
      cargoWeightKg: new Prisma.Decimal(200 + (n % 50) * 40),
      cargoVolumeM3: new Prisma.Decimal(1 + (n % 20) * 0.5),
      price: new Prisma.Decimal(150 + (n % 80) * 25),
      currency: 'USD',
      status,
      driverId: assigned ? driver.id : null,
      vehicleId: assigned ? vehicle.id : null,
      notes: ENTERPRISE_SEED_TAG,
      deliveredAt: status === 'DELIVERED' ? delivery : null,
      cancelledAt: status === 'CANCELLED' ? pickup : null,
    };
  });
  for (const batch of chunked(orderRows, 50)) {
    await prisma.order.createMany({ data: batch });
  }
  console.log(`  orders: ${orderRows.length}`);

  // Order status history (timeline fuel)
  const orderHistory = orderRows.flatMap((o, i) => {
    const n = i + 1;
    const trail: OrderStatus[] =
      o.status === 'DELIVERED'
        ? ['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']
        : o.status === 'CANCELLED'
          ? ['PENDING', 'CANCELLED']
          : ['PENDING', o.status];
    return trail.map((status, idx) => ({
      id: uuid(`ohist:${n}:${idx}:${status}`),
      organizationId: org.id,
      orderId: o.id,
      status,
      changedByUserId: admin.id,
      note: idx === 0 ? 'Created by enterprise seed' : null,
      createdAt: daysFromAnchor(anchor, (n % 60) - 22 + idx, 10),
    }));
  });
  for (const batch of chunked(orderHistory, 100)) {
    await prisma.orderStatusHistory.createMany({ data: batch });
  }
  console.log(`  order status history: ${orderHistory.length}`);

  // ── Dispatches (300 of 500 orders) ───────────────────────────────────
  /// Live statuses must not overlap on the same driver/vehicle (GiST).
  /// Slot each live dispatch uniquely: driver slot = n, vehicle slot = n.
  const liveStatuses: DispatchStatus[] = [
    'ASSIGNED',
    'EN_ROUTE_TO_PICKUP',
    'AT_PICKUP',
    'IN_TRANSIT',
  ];
  const terminalStatuses: DispatchStatus[] = ['DELIVERED', 'CANCELLED', 'DRAFT'];

  const dispatchSourceOrders = orderRows.slice(0, COUNTS.dispatches);
  const dispatchRows = dispatchSourceOrders.map((order, i) => {
    const n = i + 1;
    const isLive = n <= 90;
    /// Ensure at least COUNTS.pods delivered rows for POD proofs.
    let status: DispatchStatus;
    if (isLive) {
      status = liveStatuses[n % liveStatuses.length]!;
    } else if (n <= 90 + COUNTS.pods) {
      status = 'DELIVERED';
    } else {
      status = terminalStatuses[n % terminalStatuses.length]!;
    }
    const driver = driverRows[n % driverRows.length];
    const vehicle = vehicleRows[n % vehicleRows.length];

    /// Non-overlapping windows for live rows: 36h blocks starting at unique offsets.
    const slot = isLive ? n : n % 40;
    const pickup = daysFromAnchor(anchor, Math.floor(slot * 1.5) - 10, 6);
    const delivery = new Date(pickup.getTime() + 30 * 60 * 60 * 1000);

    return {
      id: uuid(`dispatch:${n}`),
      organizationId: org.id,
      dispatchNumber: `${PREFIX.dispatch}${pad(n, 4)}`,
      orderId: order.id,
      driverId: driver.id,
      vehicleId: vehicle.id,
      createdByUserId: admin.id,
      status,
      pickupDateScheduled: pickup,
      deliveryDateScheduled: delivery,
      pickupDateActual:
        status === 'IN_TRANSIT' || status === 'DELIVERED' || status === 'AT_PICKUP'
          ? new Date(pickup.getTime() + 60 * 60 * 1000)
          : null,
      deliveryDateActual: status === 'DELIVERED' ? delivery : null,
      notes: ENTERPRISE_SEED_TAG,
      driverAcceptanceStatus:
        status === 'DRAFT' ? ('PENDING' as const) : ('ACCEPTED' as const),
      driverAcceptedAt: status === 'DRAFT' ? null : pickup,
    };
  });

  for (const batch of chunked(dispatchRows, 40)) {
    await prisma.dispatch.createMany({ data: batch });
  }
  console.log(`  dispatches: ${dispatchRows.length}`);

  const dispatchHistory = dispatchRows.flatMap((d, i) => {
    const n = i + 1;
    const chain: DispatchStatus[] =
      d.status === 'DELIVERED'
        ? ['DRAFT', 'ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT', 'DELIVERED']
        : d.status === 'CANCELLED'
          ? ['DRAFT', 'ASSIGNED', 'CANCELLED']
          : ['DRAFT', 'ASSIGNED', d.status];
    return chain.map((status, idx) => ({
      id: uuid(`dhist:${n}:${status}:${idx}`),
      organizationId: org.id,
      dispatchId: d.id,
      status,
      changedByUserId: admin.id,
      note: idx === 0 ? 'Enterprise seed' : null,
      createdAt: new Date(d.pickupDateScheduled.getTime() - (chain.length - idx) * 3600_000),
    }));
  });
  for (const batch of chunked(dispatchHistory, 100)) {
    await prisma.dispatchStatusHistory.createMany({ data: batch });
  }
  console.log(`  dispatch status history: ${dispatchHistory.length}`);

  const assignments = dispatchRows
    .filter((d) => d.status !== 'DRAFT')
    .map((d, i) => ({
      id: uuid(`assign:${i + 1}`),
      organizationId: org.id,
      dispatchId: d.id,
      driverId: d.driverId,
      vehicleId: d.vehicleId,
      assignedAt: d.pickupDateScheduled,
      unassignedAt: d.status === 'DELIVERED' || d.status === 'CANCELLED' ? d.deliveryDateScheduled : null,
      changedByUserId: admin.id,
      reason: 'Enterprise seed assignment',
    }));
  for (const batch of chunked(assignments, 50)) {
    await prisma.dispatchAssignment.createMany({ data: batch });
  }
  console.log(`  assignments: ${assignments.length}`);

  // ── Conflicts (persisted states for UI / analytics) ──────────────────
  const conflictTypes = [
    'driver.license_expired',
    'driver.assigned',
    'vehicle.assigned',
    'schedule.dispatch_overlap',
    'schedule.late_pickup',
    'schedule.late_delivery',
    'vehicle.inspection_expired',
    'business.credit_hold',
  ] as const;
  const conflictRows = Array.from({ length: COUNTS.conflicts }, (_, i) => {
    const n = i + 1;
    const dispatch = dispatchRows[n % dispatchRows.length];
    const type = conflictTypes[n % conflictTypes.length];
    const severity = n % 5 === 0 ? 'critical' : n % 3 === 0 ? 'high' : 'medium';
    return {
      id: uuid(`conflict:${n}`),
      organizationId: org.id,
      dispatchId: dispatch.id,
      conflictKey: `enterprise:${type}:${n}`,
      type,
      severity,
      firstDetectedAt: daysFromAnchor(anchor, n % 30),
      lastDetectedAt: daysFromAnchor(anchor, (n % 30) + 1),
    };
  });
  for (const batch of chunked(conflictRows, 50)) {
    await prisma.dispatchConflictState.createMany({ data: batch });
  }
  console.log(`  conflict states: ${conflictRows.length}`);

  // ── Invoices + payments ──────────────────────────────────────────────
  const invoiceStatuses: InvoiceStatus[] = [
    'SENT',
    'PARTIALLY_PAID',
    'PAID',
    'OVERDUE',
    'DRAFT',
    'SENT',
  ];
  const invoiceRows = Array.from({ length: COUNTS.invoices }, (_, i) => {
    const n = i + 1;
    const order = orderRows[n % orderRows.length];
    const customer = customerRows[n % customerRows.length];
    const total = 200 + (n % 90) * 30;
    const status = invoiceStatuses[n % invoiceStatuses.length];
    const paid =
      status === 'PAID' ? total : status === 'PARTIALLY_PAID' ? Math.round(total * 0.4) : 0;
    return {
      id: uuid(`invoice:${n}`),
      organizationId: org.id,
      invoiceNumber: `${PREFIX.invoice}${pad(n, 4)}`,
      customerId: customer.id,
      orderId: order.id,
      issueDate: daysFromAnchor(anchor, (n % 45) - 20),
      dueDate: daysFromAnchor(anchor, (n % 45) - 5),
      currency: 'USD',
      status,
      subtotal: new Prisma.Decimal(total),
      discountAmount: new Prisma.Decimal(0),
      taxAmount: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(total),
      paidAmount: new Prisma.Decimal(paid),
      balanceDue: new Prisma.Decimal(total - paid),
      notes: ENTERPRISE_SEED_TAG,
      cancelledAt: null,
    };
  });
  for (const batch of chunked(invoiceRows, 50)) {
    await prisma.invoice.createMany({ data: batch });
  }

  const lineItems = invoiceRows.map((inv, i) => ({
    id: uuid(`iline:${i + 1}`),
    organizationId: org.id,
    invoiceId: inv.id,
    description: `Freight — ${ENTERPRISE_SEED_TAG}`,
    quantity: new Prisma.Decimal(1),
    unitPrice: inv.totalAmount,
    lineTotal: inv.totalAmount,
  }));
  for (const batch of chunked(lineItems, 50)) {
    await prisma.invoiceLineItem.createMany({ data: batch });
  }
  console.log(`  invoices: ${invoiceRows.length}`);

  const methods: PaymentMethod[] = ['BANK_TRANSFER', 'CASH', 'CARD', 'OTHER'];
  const payable = invoiceRows.filter((inv) => Number(inv.paidAmount) > 0).slice(0, COUNTS.payments);
  const paymentRows = payable.map((inv, i) => {
    const n = i + 1;
    return {
      id: uuid(`payment:${n}`),
      organizationId: org.id,
      invoiceId: inv.id,
      paymentDate: daysFromAnchor(anchor, (n % 40) - 10),
      amount: inv.paidAmount,
      currency: 'USD',
      method: methods[n % methods.length],
      reference: `PAY-E-${pad(n, 4)}`,
      notes: ENTERPRISE_SEED_TAG,
    };
  });
  /// Top up to COUNTS.payments with partial duplicates on SENT invoices if needed
  while (paymentRows.length < COUNTS.payments) {
    const n = paymentRows.length + 1;
    const inv = invoiceRows[n % invoiceRows.length];
    paymentRows.push({
      id: uuid(`payment:${n}`),
      organizationId: org.id,
      invoiceId: inv.id,
      paymentDate: daysFromAnchor(anchor, (n % 40) - 8),
      amount: new Prisma.Decimal(50 + (n % 20) * 10),
      currency: 'USD',
      method: methods[n % methods.length],
      reference: `PAY-E-${pad(n, 4)}`,
      notes: ENTERPRISE_SEED_TAG,
    });
  }
  for (const batch of chunked(paymentRows.slice(0, COUNTS.payments), 50)) {
    await prisma.payment.createMany({ data: batch });
  }
  console.log(`  payments: ${Math.min(paymentRows.length, COUNTS.payments)}`);

  // ── Documents + POD ──────────────────────────────────────────────────
  const docRows = Array.from({ length: COUNTS.documents }, (_, i) => {
    const n = i + 1;
    const order = orderRows[n % orderRows.length];
    return {
      id: uuid(`doc:${n}`),
      organizationId: org.id,
      orderId: order.id,
      kind: n % 4 === 0 ? ('POD' as const) : ('ATTACHMENT' as const),
      fileName: `enterprise-doc-${pad(n, 4)}.pdf`,
      mimeType: 'application/pdf',
      fileSizeBytes: 12_000 + n * 17,
      storagePath: `enterprise-seed/${order.id}/doc-${pad(n, 4)}.pdf`,
      uploadedByUserId: admin.id,
    };
  });
  for (const batch of chunked(docRows, 50)) {
    await prisma.orderDocument.createMany({ data: batch });
  }
  console.log(`  documents: ${docRows.length}`);

  const delivered = dispatchRows.filter((d) => d.status === 'DELIVERED').slice(0, COUNTS.pods);
  const podRows = delivered.map((d, i) => {
    const n = i + 1;
    return {
      id: uuid(`pod:${n}`),
      organizationId: org.id,
      dispatchId: d.id,
      orderId: d.orderId,
      uploadedByUserId: admin.id,
      driverId: d.driverId,
      type: n % 2 === 0 ? ('PHOTO' as const) : ('SIGNATURE' as const),
      fileName: `pod-${pad(n, 4)}.jpg`,
      mimeType: 'image/jpeg',
      fileSizeBytes: 80_000 + n * 100,
      storagePath: `enterprise-seed/pod/${d.id}/${pad(n, 4)}.jpg`,
      receiverName: `${FIRST_NAMES[n % FIRST_NAMES.length]} ${LAST_NAMES[n % LAST_NAMES.length]}`,
      receiverPhone: `+99893${pad(3000000 + n, 7).slice(-7)}`,
      notes: ENTERPRISE_SEED_TAG,
    };
  });
  if (podRows.length) {
    await prisma.dispatchDeliveryProof.createMany({ data: podRows });
  }
  console.log(`  POD proofs: ${podRows.length}`);

  // ── Notifications ────────────────────────────────────────────────────
  const categories: NotificationCategory[] = [
    'OPERATIONS',
    'FINANCE',
    'CUSTOMERS',
    'FLEET',
    'BILLING',
  ];
  const severities: NotificationSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const notifRows = Array.from({ length: COUNTS.notifications }, (_, i) => {
    const n = i + 1;
    const category = categories[n % categories.length];
    return {
      id: uuid(`notif:${n}`),
      organizationId: org.id,
      type: `ENTERPRISE_${category}_${n}`,
      category,
      severity: severities[n % severities.length],
      title: `${category} alert #${n}`,
      message: `Enterprise seed notification ${n} — ${ENTERPRISE_SEED_TAG}`,
      entityType: n % 2 === 0 ? 'Order' : 'Dispatch',
      entityId: n % 2 === 0 ? orderRows[n % orderRows.length].id : dispatchRows[n % dispatchRows.length].id,
      isRead: n % 3 === 0,
      readAt: n % 3 === 0 ? daysFromAnchor(anchor, n % 20) : null,
      isArchived: false,
      metadata: { seed: ENTERPRISE_SEED_TAG },
      createdAt: daysFromAnchor(anchor, (n % 40) - 15, 12),
    };
  });
  for (const batch of chunked(notifRows, 100)) {
    await prisma.notification.createMany({ data: batch });
  }
  console.log(`  notifications: ${notifRows.length}`);

  // ── Audit logs ───────────────────────────────────────────────────────
  const auditRows = Array.from({ length: COUNTS.auditLogs }, (_, i) => {
    const n = i + 1;
    return {
      id: uuid(`audit:${n}`),
      organizationId: org.id,
      actorUserId: admin.id,
      action: `enterprise.${rng.pick(['create', 'update', 'assign', 'status', 'payment'])}`,
      entityType: rng.pick(['Order', 'Dispatch', 'Invoice', 'Customer', 'Driver']),
      entityId: orderRows[n % orderRows.length].id,
      metadata: { seed: ENTERPRISE_SEED_TAG, index: n },
      createdAt: daysFromAnchor(anchor, (n % 50) - 25, 9),
    };
  });
  for (const batch of chunked(auditRows, 100)) {
    await prisma.auditLog.createMany({ data: batch });
  }
  console.log(`  audit logs: ${auditRows.length}`);

  console.log('\nEnterprise seed complete.');
  console.log(`  Portal login example: ${portalRows[0]?.email} / ${TEST_PASSWORD}`);
  console.log(`  Staff login unchanged: admin@flowerp.test / ${TEST_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
