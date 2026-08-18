import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:5173';
const API = process.env.API_URL || 'http://127.0.0.1:4000';
const PASSWORD = 'FlowERP-Test-2026!';

async function token(request: APIRequestContext, email: string) {
  for (let i = 0; i < 6; i++) {
    const r = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
    if (r.status() === 429) {
      await new Promise((res) => setTimeout(res, 15_000));
      continue;
    }
    if (!r.ok()) throw new Error(`login ${email} failed: ${r.status()}`);
    return (await r.json()).data.accessToken as string;
  }
  throw new Error(`429 storm for ${email}`);
}

async function injectSession(page: Page, accessToken: string) {
  await page.goto(`${FRONTEND}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((access) => {
    sessionStorage.setItem('flowerp_access_token', access);
  }, accessToken);
}

test.describe.configure({ mode: 'serial' });

test.describe('P3.3.4 Driver Workspace QA', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'authenticated', 'Run under --project=unauthenticated');
  });

  test('accept → trip → POD → delivered + staff board smoke', async ({ page, request }) => {
    test.setTimeout(240_000);
    const admin = await token(request, 'admin@flowerp.test');
    const driverTok = await token(request, 'driver@flowerp.test');
    const adminH = { Authorization: `Bearer ${admin}` };
    const driverH = { Authorization: `Bearer ${driverTok}` };
    const stamp = Date.now();

    const customerId = (
      await (
        await request.post(`${API}/customers`, {
          headers: adminH,
          data: { companyName: `Driver WS Co ${stamp}`, contactName: 'WS' },
        })
      ).json()
    ).data.id;

    const order = (
      await (
        await request.post(`${API}/orders`, {
          headers: adminH,
          data: {
            customerId,
            pickupAddress: '10 Depot',
            pickupCity: 'Tashkent',
            pickupDate: '2026-09-01',
            deliveryAddress: '20 Dock',
            deliveryCity: 'Samarkand',
            deliveryDate: '2026-09-03',
            cargoDescription: 'Driver workspace cargo',
            price: 420,
          },
        })
      ).json()
    ).data;

    const drivers = (await (await request.get(`${API}/drivers?limit=100`, { headers: adminH })).json()).data
      .items;
    const linked = drivers.find((d: { employeeCode: string }) => d.employeeCode === 'EMP-0001');
    const vehicle = (await (await request.get(`${API}/vehicles?status=AVAILABLE&limit=1`, { headers: adminH })).json())
      .data.items[0];
    expect(linked).toBeTruthy();
    expect(vehicle).toBeTruthy();

    const theirs = (
      await (await request.get(`${API}/orders?driverId=${linked.id}&limit=100`, { headers: adminH })).json()
    ).data.items;
    for (const stale of theirs.filter((o: { status: string }) =>
      ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'].includes(o.status),
    )) {
      await request.post(`${API}/orders/${stale.id}/cancel`, {
        headers: adminH,
        data: { note: 'driver-workspace cleanup' },
      });
    }

    await request.post(`${API}/orders/${order.id}/status`, {
      headers: adminH,
      data: { status: 'PENDING' },
    });
    const assign = await request.post(`${API}/orders/${order.id}/assign`, {
      headers: adminH,
      data: { driverId: linked.id, vehicleId: vehicle.id },
    });
    expect(assign.status()).toBeLessThan(400);

    const mine = (await (await request.get(`${API}/dispatches/my`, { headers: driverH })).json()).data as {
      id: string;
      order: { id: string };
      dispatchNumber: string;
    }[];
    const dispatch = mine.find((d) => d.order.id === order.id);
    expect(dispatch).toBeTruthy();

    // --- UI: driver lands on workspace hub ---
    await injectSession(page, driverTok);
    await page.goto(`${FRONTEND}/app/driver`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/app\/driver/, { timeout: 30_000 });
    await expect(page.getByText(/operations|workspace|jobs|active/i).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.goto(`${FRONTEND}/app/driver/${dispatch!.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(dispatch!.dispatchNumber)).toBeVisible({ timeout: 20_000 });

    const acceptBtn = page.getByRole('button', { name: /accept/i });
    if (await acceptBtn.isVisible().catch(() => false)) {
      await acceptBtn.click();
      await expect(page.getByRole('button', { name: /start trip|on my way|en route/i }).first()).toBeVisible({
        timeout: 15_000,
      });
    }

    // Drive trip via API for reliability; UI sticky actions may vary by label.
    const acceptApi = await request.post(`${API}/dispatches/my/${dispatch!.id}/accept`, {
      headers: driverH,
    });
    expect(acceptApi.status()).toBeLessThan(400);

    for (const status of ['EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT'] as const) {
      const step = await request.post(`${API}/dispatches/my/${dispatch!.id}/status`, {
        headers: driverH,
        data: { status },
      });
      expect(step.status(), await step.text()).toBeLessThan(400);
    }

    const photo = await request.post(`${API}/dispatches/my/${dispatch!.id}/proofs/photo`, {
      headers: driverH,
      multipart: {
        file: { name: 'pod.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('ws-pod') },
      },
    });
    const sig = await request.post(`${API}/dispatches/my/${dispatch!.id}/proofs/signature`, {
      headers: driverH,
      multipart: {
        file: { name: 'sig.png', mimeType: 'image/png', buffer: Buffer.from('ws-sig') },
      },
    });
    const meta = await request.post(`${API}/dispatches/my/${dispatch!.id}/proofs/meta`, {
      headers: driverH,
      data: { receiverName: 'Workspace Receiver' },
    });
    expect(photo.status()).toBeLessThan(400);
    expect(sig.status()).toBeLessThan(400);
    expect(meta.status()).toBeLessThan(400);

    const delivered = await request.post(`${API}/dispatches/my/${dispatch!.id}/status`, {
      headers: driverH,
      data: { status: 'DELIVERED' },
    });
    expect(delivered.status(), await delivered.text()).toBeLessThan(400);

    // Reject path on a fresh assignment
    const order2 = (
      await (
        await request.post(`${API}/orders`, {
          headers: adminH,
          data: {
            customerId,
            pickupAddress: '11 Depot',
            pickupCity: 'Tashkent',
            pickupDate: '2026-09-05',
            deliveryAddress: '21 Dock',
            deliveryCity: 'Namangan',
            deliveryDate: '2026-09-07',
            cargoDescription: 'Reject path cargo',
            price: 100,
          },
        })
      ).json()
    ).data;
    await request.post(`${API}/orders/${order2.id}/status`, {
      headers: adminH,
      data: { status: 'PENDING' },
    });
    // May need another vehicle if previous still held — use AVAILABLE list again
    const vehicle2 =
      (await (await request.get(`${API}/vehicles?status=AVAILABLE&limit=1`, { headers: adminH })).json()).data
        .items[0] ?? vehicle;
    const assign2 = await request.post(`${API}/orders/${order2.id}/assign`, {
      headers: adminH,
      data: { driverId: linked.id, vehicleId: vehicle2.id },
    });
    if (assign2.status() < 400) {
      const mine2 = (await (await request.get(`${API}/dispatches/my`, { headers: driverH })).json()).data as {
        id: string;
        order: { id: string };
      }[];
      const d2 = mine2.find((d) => d.order.id === order2.id);
      if (d2) {
        const reject = await request.post(`${API}/dispatches/my/${d2.id}/reject`, {
          headers: driverH,
          data: { reason: 'ALREADY_BUSY', note: 'Overlapping load' },
        });
        expect(reject.status()).toBeLessThan(400);
      }
    }

    // Staff board smoke — ops badge wiring must not break board load
    await injectSession(page, admin);
    await page.goto(`${FRONTEND}/app/dispatches/board`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/app\/dispatches\/board/, { timeout: 30_000 });
    await expect(page.getByText(/board|dispatch|assigned|draft/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('assignment creates driver inbox notification', async ({ request }) => {
    test.setTimeout(120_000);
    const admin = await token(request, 'admin@flowerp.test');
    const driverTok = await token(request, 'driver@flowerp.test');
    const adminH = { Authorization: `Bearer ${admin}` };
    const driverH = { Authorization: `Bearer ${driverTok}` };
    const stamp = Date.now();

    const customerId = (
      await (
        await request.post(`${API}/customers`, {
          headers: adminH,
          data: { companyName: `Assign Notif ${stamp}`, contactName: 'N' },
        })
      ).json()
    ).data.id;

    const order = (
      await (
        await request.post(`${API}/orders`, {
          headers: adminH,
          data: {
            customerId,
            pickupAddress: '1 A',
            pickupCity: 'Tashkent',
            pickupDate: '2026-10-01',
            deliveryAddress: '2 B',
            deliveryCity: 'Bukhara',
            deliveryDate: '2026-10-03',
            cargoDescription: 'notif cargo',
            price: 50,
          },
        })
      ).json()
    ).data;

    const drivers = (await (await request.get(`${API}/drivers?limit=100`, { headers: adminH })).json()).data
      .items;
    const linked = drivers.find((d: { employeeCode: string }) => d.employeeCode === 'EMP-0001');
    const vehicle = (await (await request.get(`${API}/vehicles?status=AVAILABLE&limit=1`, { headers: adminH })).json())
      .data.items[0];
    expect(linked && vehicle).toBeTruthy();

    const theirs = (
      await (await request.get(`${API}/orders?driverId=${linked.id}&limit=100`, { headers: adminH })).json()
    ).data.items;
    for (const stale of theirs.filter((o: { status: string }) =>
      ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'].includes(o.status),
    )) {
      await request.post(`${API}/orders/${stale.id}/cancel`, {
        headers: adminH,
        data: { note: 'notif cleanup' },
      });
    }

    await request.post(`${API}/orders/${order.id}/status`, {
      headers: adminH,
      data: { status: 'PENDING' },
    });
    const assign = await request.post(`${API}/orders/${order.id}/assign`, {
      headers: adminH,
      data: { driverId: linked.id, vehicleId: vehicle.id },
    });
    expect(assign.status()).toBeLessThan(400);

    const inbox = await request.get(`${API}/drivers/me/notifications`, { headers: driverH });
    expect(inbox.status()).toBe(200);
    const items = (await inbox.json()).data.items as { type: string; title: string }[];
    expect(items.some((n) => n.type === 'DRIVER_NEW_ASSIGNMENT')).toBeTruthy();
  });
});
