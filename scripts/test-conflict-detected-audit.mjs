#!/usr/bin/env node
/**
 * End-to-end verification for dispatch.conflict_detected audit events.
 * Creates two overlapping dispatches (via DRAFT → ASSIGNED) and validates audit/timeline behavior.
 */
const API = process.env.API_URL || 'http://127.0.0.1:4000';
const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:5173';
const EMAIL = 'admin@flowerp.test';
const PASSWORD = 'FlowERP-Test-2026!';

const results = [];
const pass = (name, detail = '') => results.push({ name, ok: true, detail });
const fail = (name, detail = '') => results.push({ name, ok: false, detail });

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function login() {
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (res.status === 429) {
      await sleep(5000 * (i + 1));
      continue;
    }
    if (!res.ok) throw new Error(`Login failed: ${res.status}`);
    const body = await res.json();
    return (body.data ?? body).accessToken;
  }
  throw new Error('Login rate limited');
}

async function api(token, path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = body?.message ?? body?.error ?? text;
    throw new Error(`${options.method ?? 'GET'} ${path} → ${res.status}: ${JSON.stringify(msg)}`);
  }
  return body?.data ?? body;
}

async function countDetectedAudits(token, dispatchId) {
  const audit = await api(token, `/audit?action=dispatch.conflict_detected&entityId=${dispatchId}&limit=100`);
  return audit.items?.length ?? 0;
}

async function getConflicts(token, dispatchId) {
  return api(token, `/dispatches/${dispatchId}/conflicts`);
}

async function recheckConflicts(token, dispatchId) {
  return api(token, `/dispatches/${dispatchId}/check-conflicts`, {
    method: 'POST',
    body: JSON.stringify({ recordAudit: true }),
  });
}

async function createOrder(token, payload) {
  return api(token, '/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function setOrderStatus(token, orderId, status) {
  return api(token, `/orders/${orderId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

async function createDispatch(token, { orderId, driverId, vehicleId, notes }) {
  return api(token, '/dispatches', {
    method: 'POST',
    body: JSON.stringify({ orderId, driverId, vehicleId, notes }),
  });
}

async function setStatus(token, dispatchId, status) {
  return api(token, `/dispatches/${dispatchId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

async function cancelDispatch(token, dispatchId) {
  return api(token, `/dispatches/${dispatchId}/cancel`, { method: 'POST', body: '{}' });
}

async function main() {
  console.log('=== dispatch.conflict_detected E2E Test ===\n');
  const token = await login();

  const drivers = (await api(token, '/drivers?limit=20')).items;
  const vehicles = (await api(token, '/vehicles?limit=20')).items;
  const customers = (await api(token, '/customers?limit=5')).items;

  const driver = drivers.find((d) => d.status === 'ACTIVE' && !d.archivedAt);
  const vehicle = vehicles.find((v) => v.status === 'AVAILABLE' && !v.archivedAt);
  const customer = customers[0];
  if (!driver || !vehicle || !customer) throw new Error('No active driver / available vehicle / customer');

  const tag = Date.now();
  // Unique window to avoid collisions with prior test runs / seed data.
  const dayOffset = (tag % 200) + 300;
  const basePickup = new Date(Date.UTC(2027, 0, 1 + dayOffset, 8, 0, 0));
  const baseDelivery = new Date(Date.UTC(2027, 0, 3 + dayOffset, 18, 0, 0));

  const useDriver = driver;
  const useVehicle = vehicle;

  async function makeOrder(suffix) {
    const order = await createOrder(token, {
      customerId: customer.id,
      pickupAddress: '100 Test St',
      pickupCity: 'Tashkent',
      pickupDate: basePickup.toISOString(),
      deliveryAddress: '200 Test Ave',
      deliveryCity: 'Samarkand',
      deliveryDate: baseDelivery.toISOString(),
      cargoDescription: `Conflict detected test ${suffix}`,
      cargoWeightKg: 500,
      cargoVolumeM3: 2,
      price: 1500,
      currency: 'USD',
      notes: `conflict-detected-test-${tag}-${suffix}`,
    });
    await setOrderStatus(token, order.id, 'PENDING');
    return order;
  }

  const orderA = await makeOrder('A');
  const orderB = await makeOrder('B');
  const orderC = await makeOrder('C');

  console.log(`Driver: ${useDriver.firstName} ${useDriver.lastName}`);
  console.log(`Vehicle: ${useVehicle.plateNumber}`);
  console.log(`Window: ${basePickup.toISOString()} → ${baseDelivery.toISOString()}`);
  console.log(`Orders: ${orderA.orderNumber}, ${orderB.orderNumber}, ${orderC.orderNumber}\n`);

  // --- Step 1: Create dispatch A (no overlap yet) ---
  const dispatchA = await createDispatch(token, {
    orderId: orderA.id,
    driverId: useDriver.id,
    vehicleId: useVehicle.id,
    notes: `conflict-detected-test-A-${tag}`,
  });

  // --- Step 2: Create dispatch B (+ C as DRAFT) before any ACTIVE reservation ---
  const dispatchB = await createDispatch(token, {
    orderId: orderB.id,
    driverId: useDriver.id,
    vehicleId: useVehicle.id,
    notes: `conflict-detected-test-B-${tag}`,
  });
  const dispatchC = await createDispatch(token, {
    orderId: orderC.id,
    driverId: useDriver.id,
    vehicleId: useVehicle.id,
    notes: `conflict-detected-test-C-${tag}`,
  });

  // Promote only A — B stays DRAFT so DB exclusion does not block overlap detection.
  await setStatus(token, dispatchA.id, 'ASSIGNED');

  const conflictsA = await getConflicts(token, dispatchA.id);
  const detectedBeforeA = await countDetectedAudits(token, dispatchA.id);
  const aHasOverlap = conflictsA.items?.some((c) => c.type === 'driver.assigned');
  if (!aHasOverlap) {
    pass('1. Dispatch A has no driver overlap conflict', dispatchA.dispatchNumber);
  } else {
    fail('1. Dispatch A should not overlap itself', conflictsA.items?.map((c) => c.type).join(', '));
  }

  // --- Step 3: Open conflict panel on B (GET conflicts) — triggers first detection ---
  const detectedBeforeB = await countDetectedAudits(token, dispatchB.id);
  console.log(`Dispatch A: ${dispatchA.dispatchNumber} (${dispatchA.id})`);
  console.log(`Dispatch B: ${dispatchB.dispatchNumber} (${dispatchB.id})`);
  console.log(`Detected audits on B before panel open: ${detectedBeforeB}\n`);

  // --- Step 3: Open conflict panel (GET conflicts) — triggers first detection ---
  const conflictsB1 = await getConflicts(token, dispatchB.id);
  const detectedAfterFirst = await countDetectedAudits(token, dispatchB.id);

  const hasDriverConflict = conflictsB1.items?.some((c) => c.type === 'driver.assigned');
  if (hasDriverConflict) {
    pass('2. Driver overlap conflict detected on B', conflictsB1.summary);
  } else {
    fail('2. Expected driver.assigned conflict', JSON.stringify(conflictsB1.items?.map((c) => c.type)));
  }

  if (detectedAfterFirst === detectedBeforeB + 1) {
    pass('3. dispatch.conflict_detected written once on first detection');
  } else {
    fail('3. Expected exactly one new detected audit', `before=${detectedBeforeB} after=${detectedAfterFirst}`);
  }

  // Verify audit metadata
  const auditEntries = (
    await api(token, `/audit?action=dispatch.conflict_detected&entityId=${dispatchB.id}&limit=10`)
  ).items;
  const latestDetected = auditEntries?.[0];
  if (latestDetected?.metadata?.count >= 1 && latestDetected?.metadata?.types?.length >= 1) {
    pass('4. Audit metadata has count + types', JSON.stringify(latestDetected.metadata));
  } else {
    fail('4. Audit metadata incomplete', JSON.stringify(latestDetected?.metadata));
  }

  // --- Step 4: Recheck — no duplicate detected ---
  await getConflicts(token, dispatchB.id);
  await recheckConflicts(token, dispatchB.id);
  const detectedAfterRecheck = await countDetectedAudits(token, dispatchB.id);

  if (detectedAfterRecheck === detectedAfterFirst) {
    pass('5. Recheck did not create duplicate dispatch.conflict_detected');
  } else {
    fail('5. Duplicate detected after recheck', `count=${detectedAfterRecheck}`);
  }

  // --- Step 5: Conflict disappears (cancel A) then reappears (activate C) ---
  await cancelDispatch(token, dispatchA.id);
  const conflictsBGone = await getConflicts(token, dispatchB.id);
  const driverConflictGone = !conflictsBGone.items?.some(
    (c) => c.type === 'driver.assigned' && !c.ignored && !c.resolved,
  );
  if (driverConflictGone) {
    pass('6. Conflict cleared after cancelling overlapping dispatch A');
  } else {
    fail('6. Conflict should be gone after cancel A');
  }

  await setStatus(token, dispatchC.id, 'ASSIGNED');

  const conflictsB2 = await getConflicts(token, dispatchB.id);
  const detectedAfterReappear = await countDetectedAudits(token, dispatchB.id);

  if (conflictsB2.items?.some((c) => c.type === 'driver.assigned')) {
    pass('7. Conflict reappeared after new overlap (dispatch C)');
  } else {
    fail('7. Expected conflict to reappear', JSON.stringify(conflictsB2.items?.map((c) => c.type)));
  }

  if (detectedAfterReappear === detectedAfterFirst + 1) {
    pass('8. New dispatch.conflict_detected after conflict reappeared');
  } else {
    fail(
      '8. Expected one additional detected audit',
      `first=${detectedAfterFirst} after=${detectedAfterReappear}`,
    );
  }

  // --- Browser checks (timeline + audit filter) ---
  console.log('\n--- Browser verification ---');
  console.log(`Open: ${FRONTEND}/app/dispatches/${dispatchB.id}`);
  console.log(`Audit: ${FRONTEND}/app/audit-logs?action=dispatch.conflict_detected`);

  // Cleanup note
  console.log('\n--- Test dispatches (cleanup optional) ---');
  console.log(`${dispatchA.dispatchNumber} (cancelled), ${dispatchB.dispatchNumber}, ${dispatchC.dispatchNumber}`);

  console.log('\n=== RESULTS ===');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    process.exit(1);
  }
  console.log('\nAll API checks passed.');
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
