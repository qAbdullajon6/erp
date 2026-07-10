import { test, expect, type APIRequestContext } from '@playwright/test';

/// RC3: the admin's golden path, end to end against the real API.
/// Reports every step so one failure does not mask the next.
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

test('RC3: customer -> order -> dispatch -> invoice -> payments -> report', async ({ request }) => {
  test.setTimeout(600_000);
  const t = await token(request, 'admin@flowerp.test');
  const auth = { Authorization: `Bearer ${t}` };
  const stamp = Date.now();

  const financeBefore = await (await request.get(`${API}/finance/summary`, { headers: auth })).json();
  const collectedBefore = parseFloat(financeBefore.data.invoices.totalCollected);

  // Customer
  const custRes = await request.post(`${API}/customers`, {
    headers: auth,
    data: { companyName: `RC Co ${stamp}`, contactName: 'RC Buyer' },
  });
  console.log(`[RC3] create customer: ${custRes.status()}`);
  if (custRes.status() !== 201) fail('P0', `customer create returned ${custRes.status()}`);
  const customerId = (await custRes.json()).data.id;

  // Order
  const orderRes = await request.post(`${API}/orders`, {
    headers: auth,
    data: {
      customerId,
      pickupAddress: '1 Pickup',
      pickupCity: 'Tashkent',
      pickupDate: '2026-08-01',
      deliveryAddress: '2 Delivery',
      deliveryCity: 'Samarkand',
      deliveryDate: '2026-08-05',
      cargoDescription: 'RC cargo',
      price: 1000,
    },
  });
  console.log(`[RC3] create order: ${orderRes.status()}`);
  if (orderRes.status() !== 201) fail('P0', `order create returned ${orderRes.status()}`);
  const order = (await orderRes.json()).data;

  // Dispatch needs an ACTIVE driver + AVAILABLE vehicle
  const drivers = (await (await request.get(`${API}/drivers?status=ACTIVE&limit=1`, { headers: auth })).json()).data
    .items;
  const vehicles = (await (await request.get(`${API}/vehicles?status=AVAILABLE&limit=1`, { headers: auth })).json())
    .data.items;
  if (!drivers.length || !vehicles.length) fail('P1', 'no ACTIVE driver or AVAILABLE vehicle to dispatch with');

  const dispRes = await request.post(`${API}/dispatches`, {
    headers: auth,
    data: { orderId: order.id, driverId: drivers[0].id, vehicleId: vehicles[0].id },
  });
  console.log(`[RC3] create dispatch: ${dispRes.status()}`);
  if (dispRes.status() !== 201) fail('P0', `dispatch create returned ${dispRes.status()} ${await dispRes.text()}`);

  // Only a DELIVERED order can be invoiced, so walk the order to the end of its
  // forward-only status machine. ASSIGNED comes from /assign, not /status.
  const pending = await request.post(`${API}/orders/${order.id}/status`, { headers: auth, data: { status: 'PENDING' } });
  console.log(`[RC3] order -> PENDING: ${pending.status()}`);
  if (pending.status() !== 201 && pending.status() !== 200) fail('P0', `order PENDING returned ${pending.status()}`);

  const assign = await request.post(`${API}/orders/${order.id}/assign`, {
    headers: auth,
    data: { driverId: drivers[0].id, vehicleId: vehicles[0].id },
  });
  console.log(`[RC3] order -> ASSIGNED (assign): ${assign.status()}`);
  if (assign.status() >= 400) fail('P0', `order assign returned ${assign.status()} ${await assign.text()}`);

  for (const status of ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED']) {
    const step = await request.post(`${API}/orders/${order.id}/status`, { headers: auth, data: { status } });
    console.log(`[RC3] order -> ${status}: ${step.status()}`);
    if (step.status() >= 400) fail('P0', `order ${status} returned ${step.status()} ${await step.text()}`);
  }

  // Invoice from the order
  const invRes = await request.post(`${API}/invoices/from-order/${order.id}`, { headers: auth, data: {} });
  console.log(`[RC3] invoice from order: ${invRes.status()}`);
  if (![200, 201].includes(invRes.status())) fail('P0', `invoice-from-order returned ${invRes.status()} ${await invRes.text()}`);
  const invoice = (await invRes.json()).data;
  const total = parseFloat(invoice.totalAmount);
  console.log(`[RC3] invoice ${invoice.invoiceNumber} total=${total} status=${invoice.status}`);

  // An invoice must be sent before it can take a payment — a DRAFT is still
  // being edited, so money against it would have nothing to reconcile to.
  const send = await request.post(`${API}/invoices/${invoice.id}/send`, { headers: auth, data: {} });
  console.log(`[RC3] send invoice: ${send.status()}`);
  if (send.status() >= 400) fail('P0', `invoice send returned ${send.status()} ${await send.text()}`);

  // Partial payment
  const half = Math.round(total * 50) / 100;
  const pay1 = await request.post(`${API}/invoices/${invoice.id}/payments`, {
    headers: auth,
    data: { amount: half, method: 'BANK_TRANSFER' },
  });
  console.log(`[RC3] partial payment ${half}: ${pay1.status()}`);
  if (pay1.status() !== 201) fail('P0', `partial payment returned ${pay1.status()} ${await pay1.text()}`);

  let inv = (await (await request.get(`${API}/invoices/${invoice.id}`, { headers: auth })).json()).data;
  console.log(`[RC3] after partial: status=${inv.status} paid=${inv.paidAmount} balance=${inv.balanceDue}`);
  if (inv.status !== 'PARTIALLY_PAID') fail('P1', `expected PARTIALLY_PAID, got ${inv.status}`);

  // Overpayment must be refused
  const over = await request.post(`${API}/invoices/${invoice.id}/payments`, {
    headers: auth,
    data: { amount: total, method: 'CASH' },
  });
  console.log(`[RC3] overpayment attempt: ${over.status()} (expect 4xx)`);
  if (over.status() < 400) fail('P0', 'an invoice can be overpaid');

  // Settle the rest
  const rest = parseFloat(inv.balanceDue);
  const pay2 = await request.post(`${API}/invoices/${invoice.id}/payments`, {
    headers: auth,
    data: { amount: rest, method: 'CASH' },
  });
  console.log(`[RC3] final payment ${rest}: ${pay2.status()}`);
  if (pay2.status() !== 201) fail('P0', `final payment returned ${pay2.status()} ${await pay2.text()}`);

  inv = (await (await request.get(`${API}/invoices/${invoice.id}`, { headers: auth })).json()).data;
  console.log(`[RC3] after full: status=${inv.status} paid=${inv.paidAmount} balance=${inv.balanceDue}`);
  if (inv.status !== 'PAID') fail('P1', `expected PAID, got ${inv.status}`);
  if (parseFloat(inv.balanceDue) !== 0) fail('P1', `balanceDue should be 0, got ${inv.balanceDue}`);

  // Finance summary must have moved by exactly the invoice total
  const financeAfter = await (await request.get(`${API}/finance/summary`, { headers: auth })).json();
  const collectedAfter = parseFloat(financeAfter.data.invoices.totalCollected);
  const delta = Math.round((collectedAfter - collectedBefore) * 100) / 100;
  console.log(`[RC3] totalCollected ${collectedBefore} -> ${collectedAfter} (delta ${delta}, invoice ${total})`);
  if (delta !== total) fail('P1', `finance summary moved by ${delta}, expected ${total}`);

  // Financial report reachable
  const report = await request.get(`${API}/reports/financial`, { headers: auth });
  console.log(`[RC3] financial report: ${report.status()}`);
  if (report.status() !== 200) fail('P1', `financial report returned ${report.status()}`);
});

test.afterAll(() => {
  console.log('\n=========== RC3 FINDINGS ===========');
  findings.length ? findings.forEach((f) => console.log('  ' + f)) : console.log('  none');
  console.log('====================================\n');
  expect(findings.filter((f) => f.startsWith('P0'))).toEqual([]);
});
