import { test, expect, type APIRequestContext } from '@playwright/test';

/// RC4–RC6: dispatcher, driver, accountant and sales, driven against the real
/// API with each role's own token. Reports rather than asserts so one broken
/// step does not hide the rest.
const API = process.env.API_URL || 'http://localhost:4000';
const PASSWORD = 'FlowERP-Test-2026!';
const findings: string[] = [];
const fail = (p: string, msg: string) => findings.push(`${p} — ${msg}`);

test.describe.configure({ mode: 'serial' });

async function token(request: APIRequestContext, email: string) {
  for (let i = 0; i < 6; i++) {
    const r = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
    if (r.status() === 429) {
      await new Promise((res) => setTimeout(res, 15_000));
      continue;
    }
    return (await r.json()).data.accessToken as string;
  }
  throw new Error(`429 storm for ${email}`);
}
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

test('RC4: dispatcher assigns and drives a dispatch through its lifecycle', async ({ request }) => {
  test.setTimeout(600_000);
  const admin = bearer(await token(request, 'admin@flowerp.test'));
  const disp = bearer(await token(request, 'dispatcher@flowerp.test'));
  const stamp = Date.now();

  const customerId = (
    await (
      await request.post(`${API}/customers`, {
        headers: admin,
        data: { companyName: `RC Dispatch Co ${stamp}`, contactName: 'RC' },
      })
    ).json()
  ).data.id;

  const order = (
    await (
      await request.post(`${API}/orders`, {
        headers: disp,
        data: {
          customerId,
          pickupAddress: '1 A',
          pickupCity: 'Tashkent',
          pickupDate: '2026-08-01',
          deliveryAddress: '2 B',
          deliveryCity: 'Bukhara',
          deliveryDate: '2026-08-04',
          cargoDescription: 'RC dispatcher cargo',
          price: 500,
        },
      })
    ).json()
  ).data;
  console.log(`[RC4] dispatcher created order ${order.orderNumber}`);

  // Anyone *except* EMP-0001: that driver is linked to driver@flowerp.test and
  // is reserved for RC5. A driver with a live assignment cannot take another
  // (the API prevents double-booking), so the two tests must not share one.
  const drivers = (await (await request.get(`${API}/drivers?status=ACTIVE&limit=100`, { headers: disp })).json()).data
    .items;
  const linked = drivers.find((d: { employeeCode: string }) => d.employeeCode !== 'EMP-0001') ?? drivers[0];
  const vehicle = (await (await request.get(`${API}/vehicles?status=AVAILABLE&limit=1`, { headers: disp })).json())
    .data.items[0];
  if (!linked || !vehicle) {
    fail('P1', 'no ACTIVE driver or AVAILABLE vehicle for the dispatcher flow');
    return;
  }

  const created = await request.post(`${API}/dispatches`, {
    headers: disp,
    data: { orderId: order.id, driverId: linked.id, vehicleId: vehicle.id },
  });
  console.log(`[RC4] create dispatch: ${created.status()}`);
  if (created.status() !== 201) {
    fail('P0', `dispatcher cannot create a dispatch: ${created.status()} ${await created.text()}`);
    return;
  }
  const dispatch = (await created.json()).data;

  for (const status of ['ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT', 'DELIVERED']) {
    const step = await request.post(`${API}/dispatches/${dispatch.id}/status`, { headers: disp, data: { status } });
    console.log(`[RC4] dispatch -> ${status}: ${step.status()}`);
    if (step.status() >= 400) fail('P0', `dispatch ${status} returned ${step.status()} ${await step.text()}`);
  }

  const backwards = await request.post(`${API}/dispatches/${dispatch.id}/status`, {
    headers: disp,
    data: { status: 'IN_TRANSIT' },
  });
  console.log(`[RC4] backward transition from DELIVERED: ${backwards.status()} (expect 4xx)`);
  if (backwards.status() < 400) fail('P0', 'a delivered dispatch can be moved backwards');

  const notifications = await request.get(`${API}/notifications?limit=1`, { headers: disp });
  console.log(`[RC4] dispatcher can read notifications: ${notifications.status()}`);
  if (notifications.status() !== 200) fail('P1', `dispatcher notifications returned ${notifications.status()}`);
});

test('RC5: driver moves their own delivery ASSIGNED -> DELIVERED', async ({ request }) => {
  test.setTimeout(600_000);
  const admin = bearer(await token(request, 'admin@flowerp.test'));
  const driver = bearer(await token(request, 'driver@flowerp.test'));
  const stamp = Date.now();

  const customerId = (
    await (
      await request.post(`${API}/customers`, {
        headers: admin,
        data: { companyName: `RC Driver Co ${stamp}`, contactName: 'RC' },
      })
    ).json()
  ).data.id;

  const order = (
    await (
      await request.post(`${API}/orders`, {
        headers: admin,
        data: {
          customerId,
          pickupAddress: '1 A',
          pickupCity: 'Tashkent',
          pickupDate: '2026-08-01',
          deliveryAddress: '2 B',
          deliveryCity: 'Andijan',
          deliveryDate: '2026-08-03',
          cargoDescription: 'RC driver cargo',
          price: 300,
        },
      })
    ).json()
  ).data;

  const drivers = (await (await request.get(`${API}/drivers?limit=100`, { headers: admin })).json()).data.items;
  const linked = drivers.find((d: { employeeCode: string }) => d.employeeCode === 'EMP-0001');
  const vehicle = (await (await request.get(`${API}/vehicles?status=AVAILABLE&limit=1`, { headers: admin })).json())
    .data.items[0];

  // Free the linked driver first. Earlier RC runs may have left them mid-trip,
  // and the API refuses to double-book — a correct rule, not a defect.
  const theirs = (await (await request.get(`${API}/orders?driverId=${linked.id}&limit=100`, { headers: admin })).json())
    .data.items;
  for (const stale of theirs.filter((o: { status: string }) =>
    ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'].includes(o.status),
  )) {
    await request.post(`${API}/orders/${stale.id}/cancel`, { headers: admin, data: { note: 'RC cleanup' } });
  }

  await request.post(`${API}/orders/${order.id}/status`, { headers: admin, data: { status: 'PENDING' } });
  const assign = await request.post(`${API}/orders/${order.id}/assign`, {
    headers: admin,
    data: { driverId: linked.id, vehicleId: vehicle.id },
  });
  console.log(`[RC5] assign to linked driver: ${assign.status()}`);
  if (assign.status() >= 400) fail('P1', `assign to linked driver returned ${assign.status()} ${await assign.text()}`);

  // The driver only ever sees their own work.
  const mine = await request.get(`${API}/orders/my`, { headers: driver });
  console.log(`[RC5] GET /orders/my: ${mine.status()}`);
  if (mine.status() !== 200) {
    fail('P0', `driver cannot list their deliveries: ${mine.status()}`);
    return;
  }
  // /orders/my returns a plain array, not the paginated { items, meta } shape
  // the org-wide list uses.
  const items = (await mine.json()).data as { id: string }[];
  const found = items.some((o) => o.id === order.id);
  console.log(`[RC5] assigned order visible to driver: ${found} (of ${items.length})`);
  if (!found) fail('P0', 'the order assigned to this driver is missing from /orders/my');

  for (const status of ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED']) {
    const step = await request.post(`${API}/orders/my/${order.id}/status`, { headers: driver, data: { status } });
    console.log(`[RC5] driver -> ${status}: ${step.status()}`);
    if (step.status() >= 400) fail('P0', `driver ${status} returned ${step.status()} ${await step.text()}`);
  }

  // A driver must not reach anyone else's data.
  const forbidden = await request.get(`${API}/orders`, { headers: driver });
  console.log(`[RC5] driver GET /orders (all): ${forbidden.status()} (expect 403)`);
  if (forbidden.status() !== 403) fail('P0', `driver reached the org-wide order list: ${forbidden.status()}`);

  const cancelAttempt = await request.post(`${API}/orders/my/${order.id}/status`, {
    headers: driver,
    data: { status: 'CANCELLED' },
  });
  console.log(`[RC5] driver cancelling own order: ${cancelAttempt.status()} (expect 4xx)`);
  if (cancelAttempt.status() < 400) fail('P0', 'a driver can cancel an order');
});

test('RC6: accountant and sales see only what they may', async ({ request }) => {
  test.setTimeout(600_000);
  const acc = bearer(await token(request, 'accountant@flowerp.test'));
  const sales = bearer(await token(request, 'sales@flowerp.test'));

  const accountantMatrix: [string, number][] = [
    ['/invoices', 200],
    ['/payments', 200],
    ['/expenses', 200],
    ['/finance/summary', 200],
    ['/reports/financial', 200],
    ['/orders', 200],
    ['/dispatches', 200],
    ['/drivers', 403],
    ['/vehicles', 403],
    ['/leads', 403],
  ];
  for (const [path, expected] of accountantMatrix) {
    const r = await request.get(`${API}${path}`, { headers: acc });
    const ok = r.status() === expected;
    console.log(`[RC6] accountant ${path}: ${r.status()} (expect ${expected}) ${ok ? '' : '<-- MISMATCH'}`);
    if (!ok) fail('P1', `accountant ${path} returned ${r.status()}, expected ${expected}`);
  }

  const salesMatrix: [string, number][] = [
    ['/customers', 200],
    ['/orders', 200],
    ['/finance/summary', 200],
    ['/reports/financial', 200],
    ['/dispatches', 403],
    ['/drivers', 403],
    ['/vehicles', 403],
    ['/leads', 403],
  ];
  for (const [path, expected] of salesMatrix) {
    const r = await request.get(`${API}${path}`, { headers: sales });
    const ok = r.status() === expected;
    console.log(`[RC6] sales ${path}: ${r.status()} (expect ${expected}) ${ok ? '' : '<-- MISMATCH'}`);
    if (!ok) fail('P1', `sales ${path} returned ${r.status()}, expected ${expected}`);
  }

  // An accountant may approve an expense; sales may not.
  const expenses = (await (await request.get(`${API}/expenses?status=PENDING&limit=1`, { headers: acc })).json()).data
    .items;
  if (expenses.length) {
    const salesApprove = await request.post(`${API}/expenses/${expenses[0].id}/approve`, { headers: sales, data: {} });
    console.log(`[RC6] sales approving an expense: ${salesApprove.status()} (expect 403)`);
    if (salesApprove.status() !== 403) fail('P0', `sales approved an expense: ${salesApprove.status()}`);
  } else {
    console.log('[RC6] no PENDING expense to test approval against');
  }
});

test.afterAll(() => {
  console.log('\n=========== RC4-RC6 FINDINGS ===========');
  findings.length ? findings.forEach((f) => console.log('  ' + f)) : console.log('  none');
  console.log('========================================\n');
  expect(findings.filter((f) => f.startsWith('P0'))).toEqual([]);
});
