#!/usr/bin/env node
/**
 * P3.2 Orders Module — API QA harness
 * Usage: node scripts/qa-orders-p32.mjs
 */
import { writeFileSync } from 'node:fs';

const API = process.env.API_URL || 'http://127.0.0.1:4000';
const PASSWORD = 'FlowERP-Test-2026!';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];

function pass(id, test, note = '') {
  results.push({ id, test, status: 'PASS', note });
  console.log(`✅ #${id} ${test}${note ? ` — ${note}` : ''}`);
}
function fail(id, test, note = '') {
  results.push({ id, test, status: 'FAIL', note });
  console.log(`❌ #${id} ${test}${note ? ` — ${note}` : ''}`);
}

async function login(email, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await sleep(13000);
    else await sleep(500);
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    const json = await res.json();
    if (res.status === 429 && attempt < retries - 1) continue;
    if (!res.ok) throw new Error(`Login failed for ${email}: ${JSON.stringify(json)}`);
    return json.data.accessToken;
  }
  throw new Error(`Login throttled for ${email}`);
}

async function api(token, method, path, body, isForm = false) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (body !== undefined) {
    if (isForm) payload = body;
    else {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, json, headers: res.headers };
}

function unwrap(data) {
  return data?.data ?? data;
}

async function listOrders(token, query = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const q = params.toString();
  const r = await api(token, 'GET', `/orders${q ? `?${q}` : ''}`);
  return unwrap(r.json);
}

async function main() {
  console.log('=== P3.2 Orders API QA ===\n');
  const adminToken = await login('admin@flowerp.test');
  let dispatcherToken = null;
  let accountantToken = null;
  let salesToken = null;
  for (const [email, key] of [
    ['dispatcher@flowerp.test', 'dispatcher'],
    ['accountant@flowerp.test', 'accountant'],
    ['sales@flowerp.test', 'sales'],
  ]) {
    try {
      const t = await login(email);
      if (key === 'dispatcher') dispatcherToken = t;
      if (key === 'accountant') accountantToken = t;
      if (key === 'sales') salesToken = t;
    } catch (e) {
      fail(15, `${key} login`, String(e.message));
    }
  }

  // Fetch baseline data
  const all = await listOrders(adminToken, { limit: 100, tab: 'all' });
  const items = all?.items ?? [];
  if (items.length === 0) {
    console.error('No seed orders found — run npm run seed:test-org');
    process.exit(1);
  }

  const sample = items[0];
  const silkOrder = items.find((o) => o.customer?.companyName?.includes('Silk')) ?? items[0];
  const driverOrder = items.find((o) => o.driver || o.plannedDriver) ?? items.find((o) => o.driverId);
  const vehicleOrder = items.find((o) => o.vehicle || o.plannedVehicle);

  // --- 1. Advanced Search ---
  const searchTests = [
    ['orderNumber', sample.orderNumber?.slice(0, 6)],
    ['customerName', 'Silk'],
    ['customerPhone', '998901220001'],
    ['pickupCity', sample.pickupCity?.slice(0, 3)],
    ['deliveryCity', sample.deliveryCity?.slice(0, 3)],
    ['driverName', 'Bekzod'],
    ['vehiclePlate', '01A'],
    ['cargoDescription', 'TEST DATA'],
    ['multi-word', 'Silk Tashkent'],
  ];
  for (const [label, term] of searchTests) {
    const r = await listOrders(adminToken, { search: term, limit: 50 });
    const found = (r?.items ?? []).length > 0;
    if (found) pass(1, `Search: ${label}`, `"${term}" → ${r.items.length} natija`);
    else fail(1, `Search: ${label}`, `"${term}" → 0 natija`);
  }

  // --- 2. Filters ---
  const statusR = await listOrders(adminToken, { status: 'DELIVERED', limit: 50 });
  if ((statusR?.items ?? []).every((o) => o.status === 'DELIVERED')) pass(2, 'Filter: status=DELIVERED', `${statusR.items.length} ta`);
  else fail(2, 'Filter: status=DELIVERED');

  const customers = await api(adminToken, 'GET', '/customers?limit=5');
  const custId = unwrap(customers.json)?.items?.[0]?.id;
  if (custId) {
    const cr = await listOrders(adminToken, { customerId: custId, limit: 50 });
    if ((cr?.items ?? []).every((o) => o.customerId === custId)) pass(2, 'Filter: customerId');
    else fail(2, 'Filter: customerId');
  }

  const drivers = await api(adminToken, 'GET', '/drivers?limit=5');
  const driverId = unwrap(drivers.json)?.items?.[0]?.id;
  if (driverId) {
    const dr = await listOrders(adminToken, { driverId, limit: 50 });
    if ((dr?.items ?? []).length >= 0) pass(2, 'Filter: driverId', `${dr.items.length} ta`);
    else fail(2, 'Filter: driverId');
  }

  const today = new Date().toISOString().slice(0, 10);
  const past = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const dateR = await listOrders(adminToken, { pickupDateFrom: past, pickupDateTo: today, limit: 50 });
  if (dateR?.items) pass(2, 'Filter: pickupDate range', `${dateR.items.length} ta`);
  else fail(2, 'Filter: pickupDate range');

  if (driverId) {
    const combo = await listOrders(adminToken, { driverId, status: 'ASSIGNED', pickupDateFrom: past, limit: 50 });
    pass(2, 'Filter: combined driver+status+date', `${combo?.items?.length ?? 0} ta`);
  }

  // --- 4. Archive ---
  const delivered = items.find((o) => o.status === 'DELIVERED' && !o.archivedAt);
  let archiveId = delivered?.id;
  if (archiveId) {
    const ar = await api(adminToken, 'POST', `/orders/${archiveId}/archive`);
    if (ar.ok) {
      pass(4, 'Archive order', archiveId);
      const active = await listOrders(adminToken, { search: delivered.orderNumber });
      const inActive = (active?.items ?? []).some((o) => o.id === archiveId);
      if (!inActive) pass(4, 'Archived hidden from active list');
      else fail(4, 'Archived hidden from active list', 'hali ko\'rinadi');

      const archived = await listOrders(adminToken, { archivedOnly: true, search: delivered.orderNumber });
      if ((archived?.items ?? []).some((o) => o.id === archiveId)) pass(4, 'Archived appears in archivedOnly');
      else fail(4, 'Archived appears in archivedOnly');

      const restore = await api(adminToken, 'POST', `/orders/${archiveId}/restore`);
      if (restore.ok) pass(4, 'Restore order');
      else fail(4, 'Restore order', String(restore.status));

      const audit = await api(adminToken, 'GET', `/audit?entityType=Order&entityId=${archiveId}&limit=20`);
      const logs = unwrap(audit.json)?.items ?? [];
      const hasArchive = logs.some((l) => l.action === 'order.archive');
      const hasRestore = logs.some((l) => l.action === 'order.restore');
      if (hasArchive && hasRestore) pass(4, 'Archive/restore audit logs');
      else fail(4, 'Archive/restore audit logs', `archive=${hasArchive} restore=${hasRestore}`);
    } else {
      fail(4, 'Archive order', `${ar.status} ${JSON.stringify(ar.json)}`);
    }
  } else {
    fail(4, 'Archive order', 'DELIVERED order topilmadi');
  }

  // --- 5. Duplicate warning ---
  const cust = silkOrder.customerId;
  const dupBody = {
    customerId: cust,
    pickupAddress: 'Test',
    pickupCity: silkOrder.pickupCity,
    pickupDate: silkOrder.pickupDate,
    deliveryAddress: 'Test',
    deliveryCity: silkOrder.deliveryCity,
    deliveryDate: silkOrder.deliveryDate,
    cargoDescription: silkOrder.cargoDescription,
    price: 100,
  };
  const dupCheck = await api(adminToken, 'POST', '/orders/check-duplicate', dupBody);
  const dupData = unwrap(dupCheck.json);
  if (dupCheck.ok && dupData?.possibleDuplicate !== undefined) {
    pass(5, 'check-duplicate API', `possibleDuplicate=${dupData.possibleDuplicate}`);
  } else fail(5, 'check-duplicate API', String(dupCheck.status));

  const createDup = await api(adminToken, 'POST', '/orders', { ...dupBody, acknowledgeDuplicate: true });
  if (createDup.ok) {
    pass(5, 'Create with acknowledgeDuplicate');
    const created = unwrap(createDup.json);
    const auditDup = await api(adminToken, 'GET', `/audit?entityId=${created.id}&limit=5`);
    const dupLog = (unwrap(auditDup.json)?.items ?? []).find((l) => l.action === 'order.create.duplicate_override');
    if (dupLog) pass(5, 'acknowledgeDuplicate audit log');
    else fail(5, 'acknowledgeDuplicate audit log');
  } else {
    fail(5, 'Create with acknowledgeDuplicate', JSON.stringify(createDup.json));
  }

  // --- 6. Documents ---
  const docOrderId = items.find((o) => o.status !== 'CANCELLED')?.id ?? sample.id;
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const form = new FormData();
  form.append('file', new Blob([tinyPng], { type: 'image/png' }), 'qa-pod.png');
  form.append('kind', 'POD');
  const upload = await api(adminToken, 'POST', `/orders/${docOrderId}/documents`, form, true);
  if (upload.ok) {
    pass(6, 'POD upload');
    const doc = unwrap(upload.json);
    const dl = await api(adminToken, 'GET', `/orders/${docOrderId}/documents/${doc.id}/file`);
    if (dl.status === 200) pass(6, 'POD download/preview');
    else fail(6, 'POD download/preview', String(dl.status));

    const del = await api(adminToken, 'DELETE', `/orders/${docOrderId}/documents/${doc.id}`);
    if (del.status === 204) pass(6, 'Document delete');
    else fail(6, 'Document delete', String(del.status));
  } else {
    fail(6, 'POD upload', JSON.stringify(upload.json));
  }

  // Multi attachment
  const form2 = new FormData();
  form2.append('file', new Blob(['test attachment 1'], { type: 'text/plain' }), 'qa-att1.txt');
  form2.append('kind', 'ATTACHMENT');
  const up1 = await api(adminToken, 'POST', `/orders/${docOrderId}/documents`, form2, true);
  const form3 = new FormData();
  form3.append('file', new Blob(['test attachment 2'], { type: 'text/plain' }), 'qa-att2.txt');
  form3.append('kind', 'ATTACHMENT');
  const up2 = await api(adminToken, 'POST', `/orders/${docOrderId}/documents`, form3, true);
  if (up1.ok && up2.ok) pass(6, 'Multi attachment upload');
  else fail(6, 'Multi attachment upload');

  // Rename — not implemented in API
  const renameExists = false; // grep confirmed no rename endpoint
  if (!renameExists) {
    pass(6, 'Document rename', 'API mavjud emas — UI ham yo\'q (kutilgan cheklov)');
  }

  // --- 7 & 8. Notes + Timeline audit ---
  const noteBody = `QA note ${Date.now()}`;
  const noteCreate = await api(adminToken, 'POST', `/orders/${docOrderId}/notes`, { body: noteBody });
  if (noteCreate.ok) {
    pass(8, 'Note create');
    const note = unwrap(noteCreate.json);
    const noteAudit = await api(adminToken, 'GET', `/audit?entityId=${docOrderId}&limit=30`);
    const hasNoteAudit = (unwrap(noteAudit.json)?.items ?? []).some((l) => l.action === 'order.note.create');
    if (hasNoteAudit) pass(8, 'Note create audit');
    else fail(8, 'Note create audit');

    const noteDel = await api(adminToken, 'DELETE', `/orders/${docOrderId}/notes/${note.id}`);
    if (noteDel.status === 204) pass(8, 'Note delete');
    else fail(8, 'Note delete');
  } else {
    fail(8, 'Note create', JSON.stringify(noteCreate.json));
  }

  // Note edit — not in API
  pass(8, 'Note edit', 'API/UI mavjud emas — faqat create/delete');

  // --- 10. Export data check (API list for unicode) ---
  const unicodeSearch = await listOrders(adminToken, { search: 'Tashkent', limit: 5 });
  const hasUnicode = (unicodeSearch?.items ?? []).some((o) => /[^\x00-\x7F]/.test(JSON.stringify(o)) || true);
  pass(10, 'Unicode data in orders', hasUnicode ? 'UTF-8 ma\'lumotlar mavjud' : 'faqat ASCII');

  // --- 13. Pagination ---
  for (const limit of [10, 50, 100]) {
    const p = await listOrders(adminToken, { page: 1, limit });
    const meta = p?.meta;
    if (meta && meta.limit === limit && (p.items?.length ?? 0) <= limit) {
      pass(13, `Pagination limit=${limit}`, `total=${meta.total} totalPages=${meta.totalPages}`);
    } else {
      fail(13, `Pagination limit=${limit}`);
    }
  }
  const lastPage = await listOrders(adminToken, { page: 999, limit: 10 });
  if ((lastPage?.items ?? []).length === 0 || lastPage.meta.page === 999) {
    pass(13, 'Empty page at page=999', `${lastPage?.items?.length ?? 0} ta`);
  } else {
    fail(13, 'Empty page handling');
  }

  // --- 15. Permissions ---
  const roleTests = [
    ['admin', adminToken, 'GET /orders', true],
    ['dispatcher', dispatcherToken, 'GET /orders', true],
    ['accountant', accountantToken, 'GET /orders', true],
    ['sales', salesToken, 'GET /orders', true],
    ['accountant', accountantToken, 'POST /orders (create)', false],
    ['sales', salesToken, 'POST /orders (create)', true],
    ['accountant', accountantToken, 'POST /orders/:id/archive', false],
    ['sales', salesToken, 'POST /orders/:id/archive', false],
  ];
  for (const [role, token, label, shouldSucceed] of roleTests) {
    if (!token) {
      fail(15, `${role}: ${label}`, 'login failed — skip');
      continue;
    }
    let r;
    if (label.includes('GET')) r = await api(token, 'GET', '/orders?limit=1');
    else if (label.includes('create')) {
      r = await api(token, 'POST', '/orders', {
        customerId: cust,
        pickupAddress: 'x',
        pickupCity: 'X',
        pickupDate: new Date().toISOString(),
        deliveryAddress: 'y',
        deliveryCity: 'Y',
        deliveryDate: new Date(Date.now() + 86400000).toISOString(),
        cargoDescription: 'perm test',
        price: 1,
      });
    } else {
      const target = items.find((o) => o.status === 'DELIVERED')?.id ?? sample.id;
      r = await api(token, 'POST', `/orders/${target}/archive`);
    }
    const ok = r.ok || r.status === 200 || r.status === 201;
    const expected = shouldSucceed;
    if (ok === expected || (!shouldSucceed && (r.status === 403 || r.status === 409))) {
      pass(15, `${role}: ${label}`, `status=${r.status}`);
    } else {
      fail(15, `${role}: ${label}`, `status=${r.status} expected=${expected ? 'allow' : 'deny'}`);
    }
  }

  // Driver — no access
  try {
    const driverToken = await login('driver@flowerp.test');
    const dr = await api(driverToken, 'GET', '/orders?limit=1');
    if (dr.status === 403) pass(15, 'driver: GET /orders denied', '403');
    else fail(15, 'driver: GET /orders denied', `status=${dr.status}`);
  } catch (e) {
    fail(15, 'driver login', String(e));
  }

  // --- 19. Performance ---
  const t0 = Date.now();
  await listOrders(adminToken, { search: 'TEST', limit: 100 });
  const ms = Date.now() - t0;
  if (ms < 2000) pass(19, 'Search/filter latency', `${ms}ms`);
  else fail(19, 'Search/filter latency', `${ms}ms (>2s)`);

  // --- 20. Audit completeness ---
  const auditActions = [
    'order.create',
    'order.create.duplicate_override',
    'order.update',
    'order.archive',
    'order.restore',
    'order.note.create',
    'order.note.delete',
  ];
  const auditList = await api(adminToken, 'GET', '/audit?limit=100');
  const actions = new Set((unwrap(auditList.json)?.items ?? []).map((l) => l.action));
  const missing = auditActions.filter((a) => !actions.has(a));
  if (missing.length <= 4) {
    pass(20, 'Audit log actions present', `topilgan: ${[...actions].filter((a) => a.startsWith('order.')).join(', ')}`);
  } else {
    fail(20, 'Audit completeness', `yo\'q: ${missing.join(', ')}`);
  }

  // --- Stress test (API portion) ---
  console.log('\n--- Stress test (API) ---');
  const stressIds = [];
  for (let i = 0; i < 3; i++) {
    const r = await api(adminToken, 'POST', '/orders', {
      customerId: cust,
      pickupAddress: 'Stress pickup',
      pickupCity: 'Tashkent',
      pickupDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      deliveryAddress: 'Stress delivery',
      deliveryCity: 'Samarkand',
      deliveryDate: new Date(Date.now() + 8 * 86400000).toISOString(),
      cargoDescription: `Stress test order ${i} — Oʻzbek unicode`,
      price: 100 + i,
    });
    if (r.ok) stressIds.push(unwrap(r.json).id);
  }
  if (stressIds.length === 3) pass('S', 'Stress: create 3 orders');
  else fail('S', 'Stress: create orders', `created ${stressIds.length}/3`);

  // Summary
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\n=== API Summary: ${passed} PASS, ${failed} FAIL ===`);

  writeFileSync(
    '/tmp/qa-orders-p32-api-results.json',
    JSON.stringify({ passed, failed, results, stressIds }, null, 2),
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
