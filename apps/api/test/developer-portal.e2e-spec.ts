import { randomUUID } from 'crypto';
import { createServer, Server } from 'http';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';
import { WebhookDispatcherService } from '../src/developer/webhooks/webhook-dispatcher.service';
import { verifyWebhookSignature } from '../src/developer/webhooks/webhook-signature.util';

interface AuthResultBody {
  data: {
    accessToken: string;
    user: { id: string };
    organization: { id: string; slug: string };
  };
}

/// supertest types `res.body` as `any`, which the repo's lint config rejects
/// on every member access. Every response here is unwrapped through these
/// shapes instead, matching how the sibling e2e suites cast `res.body as ...`.
interface ApiKeyBody {
  id: string;
  name: string;
  keyPrefix: string;
  keyHash?: string;
  rawKey: string;
  scopes: string[];
  status: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  rateLimitPerMinute: number;
}

interface WebhookBody {
  id: string;
  name: string;
  url: string;
  secret?: string;
  events: string[];
  isActive: boolean;
  version: number;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
}

interface AttemptBody {
  attemptNumber: number;
  status: string;
  httpStatus: number | null;
  errorMessage: string | null;
}

interface DeliveryBody {
  id: string;
  event: string;
  status: string;
  httpStatus: number | null;
  attemptCount: number;
  durationMs: number | null;
  errorMessage: string | null;
  payload: unknown;
  requestHeaders: Record<string, string>;
  replayOfId: string | null;
  deliveryAttempts: AttemptBody[];
}

interface ReplayBody {
  replayId: string;
  newDeliveryId: string;
  originalDeliveryId: string;
}

interface UsageBody {
  totalCalls: number;
  avgLatencyMs: number;
  statusBreakdown: Record<string, number>;
  endpointBreakdown: Record<string, number>;
  successCount: number;
  failureCount: number;
  successRate: number;
  lastActivityAt: string | null;
}

interface CustomerBody {
  id: string;
}

/// Unwraps the `{ data: ... }` envelope TransformInterceptor puts on every
/// response, typed at the call site.
function unwrap<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

function unwrapList<T>(res: { body: unknown }): T[] {
  return (res.body as { data: { items: T[] } }).data.items;
}

const RECEIVER_PORT = 9788;

function uniqueEmail(): string {
  return `dp-test-${randomUUID()}@example.com`;
}

describe('Developer Portal (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dispatcher: WebhookDispatcherService;
  const createdOrganizationIds: string[] = [];
  const createdUserIds: string[] = [];

  let adminToken: string;
  let otherToken: string;
  let dispatcherToken: string;

  // A real HTTP receiver, so delivery is exercised end-to-end rather than
  // against a mocked fetch that would prove nothing about the wire format.
  let receiver: Server;
  let receivedRequests: Array<{ headers: Record<string, unknown>; body: string }> = [];
  let receiverMode: 'ok' | 'fail' = 'ok';

  beforeAll(async () => {
    // The SSRF guard blocks loopback by default; the receiver below is on
    // 127.0.0.1. This mirrors how a developer runs the app locally.
    process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    dispatcher = app.get(WebhookDispatcherService);

    const admin = await registerUser(`DP Test Org ${randomUUID()}`);
    adminToken = admin.accessToken;

    const other = await registerUser(`DP Other Org ${randomUUID()}`);
    otherToken = other.accessToken;

    dispatcherToken = await addMemberWithRole(admin, 'DISPATCHER');

    receiver = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        receivedRequests.push({ headers: req.headers, body });
        if (receiverMode === 'fail') {
          res.writeHead(500);
          res.end('receiver error');
          return;
        }
        res.writeHead(200);
        res.end('ok');
      });
    });
    await new Promise<void>((resolve) => receiver.listen(RECEIVER_PORT, resolve));
  });

  afterAll(async () => {
    await prisma.webhookDeliveryAttempt.deleteMany({
      where: { delivery: { organizationId: { in: createdOrganizationIds } } },
    });
    await prisma.webhookDelivery.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
    await prisma.webhookEndpoint.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
    await prisma.apiUsageRecord.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
    await prisma.apiKey.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
    await prisma.membership.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    // Guarded: if beforeAll threw partway, these may never have been created,
    // and an error here would mask the real failure.
    if (receiver) await new Promise<void>((resolve) => receiver.close(() => resolve()));
    if (app) await app.close();
    delete process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
  });

  beforeEach(() => {
    receivedRequests = [];
    receiverMode = 'ok';
  });

  /// Waits for the fan-out to land. The domain event path is deliberately
  /// asynchronous (the emit is not awaited by the domain operation), so a
  /// fixed sleep is a race: it passes on an idle machine and fails under the
  /// load of the full suite. Polls instead, and still fails fast on a real
  /// regression rather than hanging.
  async function waitForDeliveries(count: number, timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (receivedRequests.length >= count) return;
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  async function registerUser(orgName: string) {
    const res = await request(app.getHttpServer()).post('/auth/register').send({
      email: uniqueEmail(),
      password: 'correct-horse-battery',
      firstName: 'Test',
      lastName: 'Admin',
      organizationName: orgName,
    });
    const body = res.body as AuthResultBody;
    createdUserIds.push(body.data.user.id);
    createdOrganizationIds.push(body.data.organization.id);
    return body.data;
  }

  async function addMemberWithRole(
    admin: { accessToken: string; organization: { id: string } },
    role: string,
  ): Promise<string> {
    const memberEmail = uniqueEmail();
    await request(app.getHttpServer())
      .post(`/organizations/${admin.organization.id}/invitations`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ email: memberEmail, role })
      .expect(201);

    const outbox = await request(app.getHttpServer()).get('/test/mail/outbox').expect(200);
    const invite = (outbox.body as { data: Array<{ to: string; acceptUrl: string }> }).data.find(
      (e) => e.to === memberEmail,
    );
    if (!invite) throw new Error(`No invitation email for ${memberEmail}`);

    await request(app.getHttpServer())
      .post('/invite/accept')
      .send({
        token: invite.acceptUrl.split('/invite/')[1],
        firstName: 'Member',
        lastName: role,
        password: 'correct-horse-battery',
      })
      .expect(200);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: memberEmail, password: 'correct-horse-battery' })
      .expect(200);
    // Take the id from login rather than from the accept response, whose body
    // does not carry one — and it is needed for afterAll cleanup.
    const body = login.body as AuthResultBody;
    createdUserIds.push(body.data.user.id);
    return body.data.accessToken;
  }

  // Return supertest's chainable Test, not a Promise — an `async` helper here
  // would resolve to a Response, which has no .expect().
  const createKey = (body: Record<string, unknown>, token = adminToken) =>
    request(app.getHttpServer())
      .post('/admin/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const createHook = (body: Record<string, unknown>, token = adminToken) =>
    request(app.getHttpServer())
      .post('/admin/webhooks')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  // ── API keys ────────────────────────────────────────────────────

  describe('API keys', () => {
    it('returns the raw key exactly once, and never the hash', async () => {
      const res = await createKey({ name: 'Once', scopes: ['orders:read'] }).expect(201);
      const created = unwrap<ApiKeyBody>(res);

      expect(created.rawKey).toMatch(/^flowerp_live_/);
      expect(created.keyHash).toBeUndefined();

      const list = await request(app.getHttpServer())
        .get('/admin/api-keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const listed = unwrapList<ApiKeyBody>(list).find((k) => k.id === created.id)!;
      expect(listed.rawKey).toBeUndefined();
      expect(listed.keyHash).toBeUndefined();
      expect(listed.keyPrefix).toBe(created.keyPrefix);
    });

    it('rejects an unknown scope', async () => {
      await createKey({ name: 'Bad', scopes: ['orders:destroy'] }).expect(400);
    });

    it('rotation invalidates the old secret and issues a new one', async () => {
      const created = unwrap<ApiKeyBody>(await createKey({ name: 'Rotate', scopes: ['orders:read'] }).expect(201));

      const rotated = unwrap<ApiKeyBody>(await request(app.getHttpServer())
          .post(`/admin/api-keys/${created.id}/rotate`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200));

      expect(rotated.rawKey).not.toBe(created.rawKey);
      expect(rotated.keyPrefix).not.toBe(created.keyPrefix);

      await request(app.getHttpServer()).get('/v1/me').set('X-API-Key', created.rawKey).expect(401);
      await request(app.getHttpServer()).get('/v1/me').set('X-API-Key', rotated.rawKey).expect(200);
    });

    it('revocation is terminal and idempotent', async () => {
      const created = unwrap<ApiKeyBody>(await createKey({ name: 'Revoke', scopes: ['orders:read'] }).expect(201));

      await request(app.getHttpServer())
        .delete(`/admin/api-keys/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer()).get('/v1/me').set('X-API-Key', created.rawKey).expect(401);

      // Re-revoking is the caller getting the state they asked for, not an error.
      await request(app.getHttpServer())
        .delete(`/admin/api-keys/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // But a revoked key is dead for good — it cannot be rotated back to life.
      await request(app.getHttpServer())
        .post(`/admin/api-keys/${created.id}/rotate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
    });

    it('disable is reversible, unlike revoke', async () => {
      const created = unwrap<ApiKeyBody>(await createKey({ name: 'Toggle', scopes: ['orders:read'] }).expect(201));

      await request(app.getHttpServer())
        .post(`/admin/api-keys/${created.id}/disable`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      await request(app.getHttpServer()).get('/v1/me').set('X-API-Key', created.rawKey).expect(401);

      await request(app.getHttpServer())
        .post(`/admin/api-keys/${created.id}/enable`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      await request(app.getHttpServer()).get('/v1/me').set('X-API-Key', created.rawKey).expect(200);
    });

    it('a DISPATCHER cannot administer API keys', async () => {
      await request(app.getHttpServer())
        .get('/admin/api-keys')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .expect(403);

      await createKey({ name: 'Nope', scopes: [] }, dispatcherToken).expect(403);
    });

    it("one organization cannot see or touch another's keys", async () => {
      const mine = unwrap<ApiKeyBody>(await createKey({ name: 'Mine', scopes: ['orders:read'] }).expect(201));

      const theirList = await request(app.getHttpServer())
        .get('/admin/api-keys')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);
      expect(unwrapList<ApiKeyBody>(theirList).some((k) => k.id === mine.id)).toBe(false);

      await request(app.getHttpServer())
        .delete(`/admin/api-keys/${mine.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
    });
  });

  // ── API key authentication ──────────────────────────────────────

  describe('API key authentication', () => {
    let rawKey: string;

    beforeAll(async () => {
      const res = await createKey({ name: 'Auth Probe', scopes: ['orders:read', 'customers:read'] });
      rawKey = unwrap<ApiKeyBody>(res).rawKey;
    });

    it('accepts both the X-API-Key and Bearer transports', async () => {
      await request(app.getHttpServer()).get('/v1/me').set('X-API-Key', rawKey).expect(200);
      await request(app.getHttpServer()).get('/v1/me').set('Authorization', `Bearer ${rawKey}`).expect(200);
    });

    it('does not accept a session JWT as an API key', async () => {
      // Both schemes share the Authorization header; the namespace check is
      // what keeps them apart.
      await request(app.getHttpServer())
        .get('/v1/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(401);
    });

    it('rejects a missing or bogus key', async () => {
      await request(app.getHttpServer()).get('/v1/me').expect(401);
      await request(app.getHttpServer()).get('/v1/me').set('X-API-Key', 'flowerp_live_nope').expect(401);
    });

    it('enforces scopes per route', async () => {
      await request(app.getHttpServer()).get('/v1/orders').set('X-API-Key', rawKey).expect(200);

      const denied = await request(app.getHttpServer())
        .get('/v1/drivers')
        .set('X-API-Key', rawKey)
        .expect(403);
      expect(JSON.stringify(denied.body)).toContain('drivers:read');
    });

    it('rejects an expired key', async () => {
      const expired = unwrap<ApiKeyBody>(await createKey({
          name: 'Expired',
          scopes: ['orders:read'],
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        }).expect(201));

      await request(app.getHttpServer()).get('/v1/me').set('X-API-Key', expired.rawKey).expect(401);
    });

    it('records lastUsedAt', async () => {
      const fresh = unwrap<ApiKeyBody>(await createKey({ name: 'Tracked', scopes: ['orders:read'] }).expect(201));
      expect(fresh.lastUsedAt).toBeNull();

      await request(app.getHttpServer()).get('/v1/me').set('X-API-Key', fresh.rawKey).expect(200);
      // The write is deliberately un-awaited by the guard, so poll rather than
      // assume it has landed.
      await new Promise((r) => setTimeout(r, 500));

      const after = await request(app.getHttpServer())
        .get('/admin/api-keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const tracked = unwrapList<ApiKeyBody>(after).find((k) => k.id === fresh.id)!;
      expect(tracked.lastUsedAt).not.toBeNull();
    });

    it("scopes data to the key's own organization", async () => {
      const theirs = unwrap<ApiKeyBody>(await createKey({ name: 'Theirs', scopes: ['customers:read'] }, otherToken).expect(201));

      const mineCustomers = await request(app.getHttpServer())
        .get('/v1/customers')
        .set('X-API-Key', rawKey)
        .expect(200);
      const theirCustomers = await request(app.getHttpServer())
        .get('/v1/customers')
        .set('X-API-Key', theirs.rawKey)
        .expect(200);

      const mineIds = unwrapList<CustomerBody>(mineCustomers).map((c) => c.id);
      const theirIds = unwrapList<CustomerBody>(theirCustomers).map((c) => c.id);
      expect(mineIds.filter((id: string) => theirIds.includes(id))).toEqual([]);
    });

    it('enforces the per-key rate limit and advertises the budget', async () => {
      const limited = unwrap<ApiKeyBody>(await createKey({ name: 'Limited', scopes: ['orders:read'], rateLimitPerMinute: 3 }).expect(201));

      const first = await request(app.getHttpServer()).get('/v1/me').set('X-API-Key', limited.rawKey).expect(200);
      expect(first.headers['x-ratelimit-limit']).toBe('3');
      expect(first.headers['x-ratelimit-remaining']).toBe('2');

      await request(app.getHttpServer()).get('/v1/me').set('X-API-Key', limited.rawKey).expect(200);
      await request(app.getHttpServer()).get('/v1/me').set('X-API-Key', limited.rawKey).expect(200);

      const rejected = await request(app.getHttpServer())
        .get('/v1/me')
        .set('X-API-Key', limited.rawKey)
        .expect(429);
      // Retry-After must be a header: AllExceptionsFilter normalizes the body
      // to {error:{statusCode,message}} and would drop a body field.
      expect(rejected.headers['retry-after']).toBeDefined();
      expect(rejected.headers['x-ratelimit-remaining']).toBe('0');
    });
  });

  // ── Webhooks ────────────────────────────────────────────────────

  describe('webhooks', () => {
    it('returns the signing secret only on create and rotate', async () => {
      const created = unwrap<WebhookBody>(await createHook({ name: 'Secretive', url: 'https://example.com/h', events: ['order.created'] }).expect(201));
      expect(created.secret).toMatch(/^whsec_/);

      const listedRes = await request(app.getHttpServer())
        .get('/admin/webhooks')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const listed = unwrapList<WebhookBody>(listedRes).find((w) => w.id === created.id)!;
      expect(listed.secret).toBeUndefined();

      const fetched = unwrap<WebhookBody>(
        await request(app.getHttpServer())
          .get(`/admin/webhooks/${created.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200),
      );
      expect(fetched.secret).toBeUndefined();

      const rotated = unwrap<WebhookBody>(await request(app.getHttpServer())
          .post(`/admin/webhooks/${created.id}/rotate-secret`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200));
      expect(rotated.secret).toMatch(/^whsec_/);
      expect(rotated.secret).not.toBe(created.secret);
      expect(rotated.version).toBe(created.version + 1);
    });

    it('rejects SSRF targets even though loopback is allowed in this env', async () => {
      // This suite runs with allowPrivateTargets on (the receiver is on
      // 127.0.0.1). Neither of these may be reachable regardless: the metadata
      // endpoint is never a legitimate receiver, and the flag loosens only
      // WHERE we connect, never HOW.
      await createHook({
        name: 'Metadata',
        url: 'http://169.254.169.254/latest/meta-data/',
        events: ['order.created'],
      }).expect(400);

      await createHook({ name: 'Bad proto', url: 'file:///etc/passwd', events: ['order.created'] }).expect(400);
    });

    it('rejects an unknown event', async () => {
      await createHook({ name: 'Bad event', url: 'https://example.com/h', events: ['order.exploded'] }).expect(400);
    });

    it('requires at least one event', async () => {
      await createHook({ name: 'No events', url: 'https://example.com/h', events: [] }).expect(400);
    });

    it("one organization cannot see or touch another's endpoints", async () => {
      const mine = unwrap<WebhookBody>(await createHook({ name: 'Mine', url: 'https://example.com/h', events: ['order.created'] }).expect(201));

      const theirList = await request(app.getHttpServer())
        .get('/admin/webhooks')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);
      expect(unwrapList<WebhookBody>(theirList).some((w) => w.id === mine.id)).toBe(false);

      await request(app.getHttpServer())
        .get(`/admin/webhooks/${mine.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/admin/webhooks/${mine.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
    });

    it('a DISPATCHER cannot administer webhooks', async () => {
      await request(app.getHttpServer())
        .get('/admin/webhooks')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .expect(403);
    });
  });

  // ── Delivery ────────────────────────────────────────────────────

  describe('delivery', () => {
    let hookId: string;
    let secret: string;

    beforeEach(async () => {
      const created = unwrap<WebhookBody>(await createHook({
          name: 'Local Receiver',
          url: `http://127.0.0.1:${RECEIVER_PORT}/hook`,
          events: ['order.created'],
        }).expect(201));
      hookId = created.id;
      // Non-null: create is one of the two responses that returns the secret.
      secret = created.secret!;
    });

    // Each test gets a fresh endpoint; without this they accumulate, and since
    // every one subscribes to order.created against the same receiver, a later
    // test that creates an order sees one delivery per leftover endpoint. That
    // is exactly what broke the domain-events test below once the dispatcher
    // stopped dropping drain wake-ups and actually delivered them all.
    afterEach(async () => {
      await request(app.getHttpServer())
        .delete(`/admin/webhooks/${hookId}`)
        .set('Authorization', `Bearer ${adminToken}`);
    });

    it('delivers a signed payload the receiver can verify', async () => {
      const res = await request(app.getHttpServer())
        .post(`/admin/webhooks/${hookId}/test`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);

      const delivered = unwrap<DeliveryBody>(res);
      expect(delivered.status).toBe('DELIVERED');
      expect(delivered.httpStatus).toBe(200);
      expect(receivedRequests).toHaveLength(1);

      const got = receivedRequests[0];
      const signature = got.headers['x-flowerp-signature'] as string;
      expect(verifyWebhookSignature(secret, got.body, signature)).toBe(true);
      expect(verifyWebhookSignature('whsec_wrong', got.body, signature)).toBe(false);
      expect(got.headers['x-flowerp-event']).toBe('order.created');
      expect(got.headers['x-flowerp-delivery']).toBe(delivered.id);
    });

    it('never stores the signature it sent', async () => {
      const res = await request(app.getHttpServer())
        .post(`/admin/webhooks/${hookId}/test`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);

      // The stored headers are rendered in the UI; a real signature there
      // would be a valid credential for a known body.
      expect(unwrap<DeliveryBody>(res).requestHeaders['X-FlowERP-Signature']).toBe('[redacted]');
    });

    it('queues a retry rather than failing outright when the receiver errors', async () => {
      receiverMode = 'fail';

      const res = await request(app.getHttpServer())
        .post(`/admin/webhooks/${hookId}/test`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);

      // PENDING with a future nextAttemptAt IS the retry queue.
      const queued = unwrap<DeliveryBody>(res);
      expect(queued.status).toBe('PENDING');
      expect(queued.httpStatus).toBe(500);
      expect(queued.attemptCount).toBe(1);
      expect(queued.deliveryAttempts[0].status).toBe('FAILED');

      const row = await prisma.webhookDelivery.findUnique({ where: { id: queued.id } });
      expect(row?.nextAttemptAt).not.toBeNull();
      expect(row!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('marks a delivery FAILED once attempts are exhausted, and can then retry it', async () => {
      receiverMode = 'fail';
      const created = unwrap<DeliveryBody>(await request(app.getHttpServer())
          .post(`/admin/webhooks/${hookId}/test`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({})
          .expect(200));

      // Drive the remaining attempts directly rather than waiting out the
      // real backoff, which reaches minutes by attempt 5.
      for (let i = 0; i < 5; i++) {
        await prisma.webhookDelivery.updateMany({
          where: { id: created.id, status: 'PENDING' },
          data: { nextAttemptAt: new Date() },
        });
        await dispatcher.deliverNow(created.id);
      }

      const failed = await prisma.webhookDelivery.findUnique({ where: { id: created.id } });
      expect(failed?.status).toBe('FAILED');
      expect(failed?.failedAt).not.toBeNull();
      expect(failed!.attemptCount).toBeGreaterThanOrEqual(5);

      // Every physical attempt is preserved, not overwritten by the last one.
      const attempts = await prisma.webhookDeliveryAttempt.findMany({ where: { deliveryId: created.id } });
      expect(attempts.length).toBe(failed!.attemptCount);

      // A FAILED delivery can be retried in place, continuing its history.
      receiverMode = 'ok';
      const retried = await request(app.getHttpServer())
        .post(`/admin/webhooks/${hookId}/deliveries/${created.id}/retry`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const retriedBody = unwrap<DeliveryBody>(retried);
      expect(retriedBody.status).toBe('DELIVERED');
      expect(retriedBody.attemptCount).toBeGreaterThan(failed!.attemptCount);
    });

    it('refuses to retry a delivery that did not fail', async () => {
      const delivered = unwrap<DeliveryBody>(await request(app.getHttpServer())
          .post(`/admin/webhooks/${hookId}/test`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({})
          .expect(200));

      await request(app.getHttpServer())
        .post(`/admin/webhooks/${hookId}/deliveries/${delivered.id}/retry`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
    });

    it('replay forks a new delivery and leaves the original untouched', async () => {
      const original = unwrap<DeliveryBody>(await request(app.getHttpServer())
          .post(`/admin/webhooks/${hookId}/test`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({})
          .expect(200));

      const replay = await request(app.getHttpServer())
        .post(`/admin/webhooks/${hookId}/deliveries/${original.id}/replay`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const newId = unwrap<ReplayBody>(replay).newDeliveryId;
      expect(newId).not.toBe(original.id);

      await dispatcher.deliverNow(newId);

      const replayed = unwrap<DeliveryBody>(await request(app.getHttpServer())
          .get(`/admin/webhooks/${hookId}/deliveries/${newId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200));
      expect(replayed.replayOfId).toBe(original.id);
      expect(replayed.payload).toEqual(original.payload);

      const untouched = unwrap<DeliveryBody>(await request(app.getHttpServer())
          .get(`/admin/webhooks/${hookId}/deliveries/${original.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200));
      expect(untouched.attemptCount).toBe(original.attemptCount);
      expect(untouched.status).toBe(original.status);
    });

    it("cannot read another organization's deliveries", async () => {
      const mine = unwrap<DeliveryBody>(await request(app.getHttpServer())
          .post(`/admin/webhooks/${hookId}/test`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({})
          .expect(200));

      await request(app.getHttpServer())
        .get(`/admin/webhooks/${hookId}/deliveries/${mine.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
    });

    it('does not double-send when the same delivery is driven concurrently', async () => {
      const delivery = await dispatcher.enqueue({
        organizationId: createdOrganizationIds[0],
        endpointId: hookId,
        event: 'order.created',
        payload: { probe: true },
      });
      receivedRequests = [];

      // The compare-and-set claim must let exactly one caller through.
      await Promise.all([
        dispatcher.deliverNow(delivery.id),
        dispatcher.deliverNow(delivery.id),
        dispatcher.deliverNow(delivery.id),
      ]);

      expect(receivedRequests).toHaveLength(1);
    });

    it('does not drop a delivery enqueued while a drain is already running', async () => {
      // Regression guard. drain() used to `return` outright when a pass was in
      // flight, silently discarding the wake-up — so a row enqueued during that
      // window waited for the next interval tick, and under NODE_ENV=test
      // (interval disabled) waited forever. It must now coalesce instead.
      receivedRequests = [];

      const first = await dispatcher.enqueue({
        organizationId: createdOrganizationIds[0],
        endpointId: hookId,
        event: 'order.created',
        payload: { wave: 1 },
      });

      // Kick a drain and, without awaiting it, enqueue more into the same
      // window — the racy interleaving the old latch lost.
      const inFlight = dispatcher.drain();
      const second = await dispatcher.enqueue({
        organizationId: createdOrganizationIds[0],
        endpointId: hookId,
        event: 'order.created',
        payload: { wave: 2 },
      });
      await inFlight;
      await dispatcher.drain();

      const rows = await prisma.webhookDelivery.findMany({
        where: { id: { in: [first.id, second.id] } },
        select: { status: true },
      });
      expect(rows.map((r) => r.status).sort()).toEqual(['DELIVERED', 'DELIVERED']);
    });

    it('de-duplicates an enqueue by idempotency key', async () => {
      const key = `dp-idem-${randomUUID()}`;
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          dispatcher.enqueue({
            organizationId: createdOrganizationIds[0],
            endpointId: hookId,
            event: 'order.created',
            payload: { probe: true },
            idempotencyKey: key,
          }),
        ),
      );

      expect(new Set(results.map((r) => r.id)).size).toBe(1);
    });
  });

  // ── Domain events ───────────────────────────────────────────────

  describe('domain events', () => {
    it('delivers order.created to a subscribed endpoint, and nothing to a disabled one', async () => {
      const hook = unwrap<WebhookBody>(await createHook({
          name: 'Event Hook',
          url: `http://127.0.0.1:${RECEIVER_PORT}/hook`,
          events: ['order.created'],
        }).expect(201));

      const customer = unwrap<CustomerBody>(await request(app.getHttpServer())
          .post('/customers')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ companyName: `DP Hook Co ${randomUUID()}`, contactName: 'Hook' })
          .expect(201));

      const orderBody = {
        customerId: customer.id,
        pickupAddress: '1 A St',
        pickupCity: 'A',
        pickupDate: new Date(Date.now() + 86_400_000).toISOString(),
        deliveryAddress: '2 B St',
        deliveryCity: 'B',
        deliveryDate: new Date(Date.now() + 172_800_000).toISOString(),
        cargoDescription: 'Event cargo',
        price: 100,
      };

      receivedRequests = [];
      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(orderBody)
        .expect(201);

      // The fan-out is intentionally not awaited by the domain operation.
      await waitForDeliveries(1);

      expect(receivedRequests.length).toBeGreaterThanOrEqual(1);
      const envelope = JSON.parse(
        receivedRequests[receivedRequests.length - 1].body,
      ) as { event: string; occurredAt: string; data: { orderNumber?: string } };
      expect(envelope.event).toBe('order.created');
      expect(envelope.occurredAt).toEqual(expect.any(String));
      expect(envelope.data.orderNumber).toBeDefined();

      // A disabled endpoint must go quiet.
      await request(app.getHttpServer())
        .post(`/admin/webhooks/${hook.id}/disable`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      receivedRequests = [];
      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...orderBody, cargoDescription: 'Silent cargo' })
        .expect(201);
      // A fixed wait, not waitForDeliveries: this asserts an ABSENCE, and you
      // cannot poll for something never arriving. Generous enough that a
      // regression which did deliver would be caught.
      await new Promise((r) => setTimeout(r, 3_000));

      expect(receivedRequests).toHaveLength(0);
    });

    it('a failing webhook never fails the domain operation that triggered it', async () => {
      await createHook({
        name: 'Broken Hook',
        url: `http://127.0.0.1:${RECEIVER_PORT}/hook`,
        events: ['customer.created'],
      }).expect(201);

      receiverMode = 'fail';

      // This is the contract that lets the emit call sit un-awaited at the end
      // of every domain service method.
      await request(app.getHttpServer())
        .post('/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ companyName: `DP Resilient Co ${randomUUID()}`, contactName: 'Still Works' })
        .expect(201);
    });
  });

  // ── Usage ───────────────────────────────────────────────────────

  describe('usage', () => {
    it('records API-key traffic and reports it', async () => {
      const key = unwrap<ApiKeyBody>(await createKey({ name: 'Metered', scopes: ['orders:read'] }).expect(201));

      await request(app.getHttpServer()).get('/v1/orders').set('X-API-Key', key.rawKey).expect(200);
      await request(app.getHttpServer()).get('/v1/me').set('X-API-Key', key.rawKey).expect(200);
      // Writes are fire-and-forget on the response path.
      await new Promise((r) => setTimeout(r, 800));

      const usage = unwrap<UsageBody>(await request(app.getHttpServer())
          .get('/admin/usage')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200));

      expect(usage.totalCalls).toBeGreaterThanOrEqual(2);
      expect(usage.statusBreakdown['200']).toBeGreaterThanOrEqual(2);
      // Route templates, never concrete paths — otherwise ids leak into
      // analytics and the breakdown becomes unbounded.
      expect(Object.keys(usage.endpointBreakdown).some((e) => e.includes('/v1/orders'))).toBe(true);
      expect(usage.successRate).toBeGreaterThan(0);
    });

    it('counts failed calls too, not just successes', async () => {
      const key = unwrap<ApiKeyBody>(await createKey({ name: 'Failing', scopes: [] }).expect(201));

      await request(app.getHttpServer()).get('/v1/orders').set('X-API-Key', key.rawKey).expect(403);
      await new Promise((r) => setTimeout(r, 800));

      const usage = unwrap<UsageBody>(await request(app.getHttpServer())
          .get('/admin/usage')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200));

      // A success-only chart would hide exactly the failures a developer opens
      // this tab to find. This only works because usage is recorded by
      // middleware on res.on("finish"): an interceptor never runs when a guard
      // rejects, so it recorded no 403s at all.
      expect(usage.statusBreakdown['403']).toBeGreaterThanOrEqual(1);
      expect(usage.failureCount).toBeGreaterThanOrEqual(1);
    });

    it('records rate-limited (429) calls', async () => {
      const key = unwrap<ApiKeyBody>(await createKey({ name: 'Metered 429', scopes: ['orders:read'], rateLimitPerMinute: 1 }).expect(201));

      await request(app.getHttpServer()).get('/v1/orders').set('X-API-Key', key.rawKey).expect(200);
      await request(app.getHttpServer()).get('/v1/orders').set('X-API-Key', key.rawKey).expect(429);
      await new Promise((r) => setTimeout(r, 800));

      const usage = unwrap<UsageBody>(await request(app.getHttpServer())
          .get('/admin/usage')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200));

      // Rejected by a guard, so likewise invisible to an interceptor. A
      // customer hitting their ceiling must be able to see that they are.
      expect(usage.statusBreakdown['429']).toBeGreaterThanOrEqual(1);
    });

    it('rejects a malformed date bound', async () => {
      await request(app.getHttpServer())
        .get('/admin/usage?startDate=not-a-date')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it("does not report another organization's usage", async () => {
      // A fresh org with no traffic of its own: asserting 0 against `otherToken`
      // would depend on what earlier tests happened to call with its key.
      const quiet = await registerUser(`DP Quiet Org ${randomUUID()}`);

      const quietUsage = unwrap<UsageBody>(await request(app.getHttpServer())
          .get('/admin/usage')
          .set('Authorization', `Bearer ${quiet.accessToken}`)
          .expect(200));
      expect(quietUsage.totalCalls).toBe(0);
      expect(quietUsage.endpointBreakdown).toEqual({});

      // Meanwhile our own org has traffic — proving the zero above is
      // isolation, not an empty table.
      const key = unwrap<ApiKeyBody>(await createKey({ name: 'Isolation', scopes: ['orders:read'] }).expect(201));
      await request(app.getHttpServer()).get('/v1/orders').set('X-API-Key', key.rawKey).expect(200);
      await new Promise((r) => setTimeout(r, 800));

      const mineUsage = unwrap<UsageBody>(await request(app.getHttpServer())
          .get('/admin/usage')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200));
      expect(mineUsage.totalCalls).toBeGreaterThan(0);

      const stillQuiet = unwrap<UsageBody>(await request(app.getHttpServer())
          .get('/admin/usage')
          .set('Authorization', `Bearer ${quiet.accessToken}`)
          .expect(200));
      expect(stillQuiet.totalCalls).toBe(0);
    });

    it('a DISPATCHER cannot read usage', async () => {
      await request(app.getHttpServer())
        .get('/admin/usage')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .expect(403);
    });
  });

  // ── Audit ───────────────────────────────────────────────────────

  describe('audit', () => {
    it('records key lifecycle events without ever recording the secret', async () => {
      const created = unwrap<ApiKeyBody>(await createKey({ name: 'Audited', scopes: ['orders:read'] }).expect(201));
      await request(app.getHttpServer())
        .post(`/admin/api-keys/${created.id}/rotate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/admin/api-keys/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const logs = await prisma.auditLog.findMany({
        where: { entityType: 'ApiKey', entityId: created.id },
      });
      expect(logs.map((l) => l.action).sort()).toEqual(
        ['api_key.create', 'api_key.revoke', 'api_key.rotate'].sort(),
      );

      const serialized = JSON.stringify(logs);
      expect(serialized).not.toContain(created.rawKey);
    });
  });
});
