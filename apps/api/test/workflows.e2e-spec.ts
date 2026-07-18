import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';

interface AuthResultBody {
  data: {
    accessToken: string;
    user: { id: string; email: string };
    organization: { id: string; slug: string };
    membership: { id: string; role: string };
  };
}

function uniqueEmail(): string {
  return `wf-test-${randomUUID()}@example.com`;
}

describe('Workflows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdOrganizationIds: string[] = [];
  const createdUserIds: string[] = [];

  let adminToken: string;
  let orgId: string;
  let orgSlug: string;
  let dispatcherToken: string;
  let driverToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const admin = await registerUser(`WF Test Org ${randomUUID()}`);
    adminToken = admin.accessToken;
    orgId = admin.organization.id;
    orgSlug = admin.organization.slug;

    const dispatcher = await addMemberWithRole(admin, 'DISPATCHER');
    dispatcherToken = dispatcher.accessToken;

    const driver = await addMemberWithRole(admin, 'DRIVER');
    driverToken = driver.accessToken;
  });

  afterAll(async () => {
    await prisma.workflowLog.deleteMany({ where: { execution: { organizationId: { in: createdOrganizationIds } } } });
    await prisma.workflowExecutionStep.deleteMany({ where: { execution: { organizationId: { in: createdOrganizationIds } } } });
    await prisma.workflowExecution.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
    await prisma.workflowVersion.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
    await prisma.workflowSchedule.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
    await prisma.workflowWebhook.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
    await prisma.workflow.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  async function registerUser(orgName: string) {
    const email = uniqueEmail();
    const res = await request(app.getHttpServer()).post('/auth/register').send({
      email,
      password: 'correct-horse-battery',
      firstName: 'Test',
      lastName: 'Admin',
      organizationName: orgName,
    });
    const body = res.body as AuthResultBody;
    createdUserIds.push(body.data.user.id);
    createdOrganizationIds.push(body.data.organization.id);
    return { email, ...body.data };
  }

  async function addMemberWithRole(admin: { accessToken: string; organization: { id: string; slug: string } }, role: string) {
    const memberEmail = uniqueEmail();

    await request(app.getHttpServer())
      .post(`/organizations/${admin.organization.id}/invitations`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ email: memberEmail, role })
      .expect(201);

    const outboxRes = await request(app.getHttpServer()).get('/test/mail/outbox').expect(200);
    const invite = (outboxRes.body as { data: Array<{ to: string; acceptUrl: string }> }).data.find(
      (entry) => entry.to === memberEmail,
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

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: memberEmail, password: 'correct-horse-battery', organizationSlug: admin.organization.slug })
      .expect(200);
    const loginBody = loginRes.body as AuthResultBody;
    createdUserIds.push(loginBody.data.user.id);

    return { email: memberEmail, accessToken: loginBody.data.accessToken };
  }

  function authAdmin() {
    return { Authorization: `Bearer ${adminToken}` };
  }

  let workflowId: string;

  describe('CRUD', () => {
    it('creates a workflow', async () => {
      const res = await request(app.getHttpServer())
        .post('/workflows')
        .set(authAdmin())
        .send({
          name: 'Order Notification WF',
          description: 'Notify on new orders',
          config: {
            trigger: { event: 'order.created' },
            conditions: { operator: 'AND', conditions: [] },
            actions: [
              { type: 'send_notification', config: { title: 'New Order', message: 'Order {{payload.orderNumber}}' } },
            ],
          },
          active: false,
        })
        .expect(201);

      expect(res.body.data.name).toBe('Order Notification WF');
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.active).toBe(false);
      expect(res.body.data.organizationId).toBe(orgId);
      workflowId = res.body.data.id;
    });

    it('lists workflows (paginated)', async () => {
      const res = await request(app.getHttpServer())
        .get('/workflows?page=1&limit=10')
        .set(authAdmin())
        .expect(200);

      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.meta.total).toBeGreaterThanOrEqual(1);
      expect(res.body.data.meta.page).toBe(1);
    });

    it('gets workflow by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/workflows/${workflowId}`)
        .set(authAdmin())
        .expect(200);

      expect(res.body.data.id).toBe(workflowId);
      expect(res.body.data.config.trigger.event).toBe('order.created');
    });

    it('updates workflow', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/workflows/${workflowId}`)
        .set(authAdmin())
        .send({ name: 'Updated WF Name', active: true })
        .expect(200);

      expect(res.body.data.name).toBe('Updated WF Name');
      expect(res.body.data.active).toBe(true);
    });

    it('toggles active', async () => {
      const res = await request(app.getHttpServer())
        .post(`/workflows/${workflowId}/toggle`)
        .set(authAdmin())
        .expect(200);

      expect(res.body.data.active).toBe(false);
    });
  });

  describe('Publish / Archive / Duplicate / Export / Import', () => {
    it('publishes', async () => {
      await request(app.getHttpServer())
        .post(`/workflows/${workflowId}/toggle`)
        .set(authAdmin());

      const res = await request(app.getHttpServer())
        .post(`/workflows/${workflowId}/publish`)
        .set(authAdmin())
        .expect(200);

      expect(res.body.data.status).toBe('PUBLISHED');
      expect(res.body.data.version).toBe(2);
    });

    it('exports', async () => {
      const res = await request(app.getHttpServer())
        .get(`/workflows/${workflowId}/export`)
        .set(authAdmin())
        .expect(200);

      expect(res.body.data.name).toBe('Updated WF Name');
      expect(res.body.data.config).toBeDefined();
      expect(res.body.data.exportedAt).toBeDefined();
    });

    it('duplicates', async () => {
      const res = await request(app.getHttpServer())
        .post(`/workflows/${workflowId}/duplicate`)
        .set(authAdmin())
        .send({ name: 'Duplicated WF' })
        .expect(201);

      expect(res.body.data.name).toBe('Duplicated WF');
      expect(res.body.data.status).toBe('DRAFT');

      await request(app.getHttpServer())
        .delete(`/workflows/${res.body.data.id}`)
        .set(authAdmin())
        .expect(204);
    });

    it('imports', async () => {
      const res = await request(app.getHttpServer())
        .post('/workflows/import')
        .set(authAdmin())
        .send({
          name: 'Imported WF',
          config: {
            trigger: { event: 'invoice.paid' },
            actions: [{ type: 'log', config: { message: 'paid' } }],
          },
        })
        .expect(201);

      expect(res.body.data.name).toBe('Imported WF');
      expect(res.body.data.status).toBe('DRAFT');

      await request(app.getHttpServer())
        .delete(`/workflows/${res.body.data.id}`)
        .set(authAdmin())
        .expect(204);
    });

    it('archives', async () => {
      const tmp = await request(app.getHttpServer())
        .post('/workflows')
        .set(authAdmin())
        .send({
          name: 'To Archive',
          config: { trigger: { event: 'manual' }, actions: [{ type: 'log', config: { message: 'x' } }] },
        });
      const archiveId = tmp.body.data.id;

      const res = await request(app.getHttpServer())
        .post(`/workflows/${archiveId}/archive`)
        .set(authAdmin())
        .expect(200);

      expect(res.body.data.status).toBe('ARCHIVED');
      expect(res.body.data.active).toBe(false);

      await request(app.getHttpServer())
        .post(`/workflows/${archiveId}/publish`)
        .set(authAdmin())
        .expect(409);
    });
  });

  describe('Execution Engine', () => {
    it('executes manually', async () => {
      const res = await request(app.getHttpServer())
        .post(`/workflows/${workflowId}/execute`)
        .set(authAdmin())
        .send({ eventPayload: { orderNumber: 'ORD-E2E-001' } })
        .expect(200);

      expect(res.body.data.trigger).toBe('manual');
      expect(['PENDING', 'RUNNING', 'COMPLETED']).toContain(res.body.data.status);
    });

    it('respects idempotency key', async () => {
      const key = `idem-wf-${Date.now()}`;
      const r1 = await request(app.getHttpServer())
        .post(`/workflows/${workflowId}/execute`)
        .set(authAdmin())
        .send({ eventPayload: {}, idempotencyKey: key })
        .expect(200);

      const r2 = await request(app.getHttpServer())
        .post(`/workflows/${workflowId}/execute`)
        .set(authAdmin())
        .send({ eventPayload: {}, idempotencyKey: key })
        .expect(200);

      expect(r1.body.data.id).toBe(r2.body.data.id);
    });

    it('lists executions with logs', async () => {
      await new Promise((r) => setTimeout(r, 1000));

      const res = await request(app.getHttpServer())
        .get(`/workflows/${workflowId}/executions`)
        .set(authAdmin())
        .expect(200);

      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      const completed = res.body.data.items.find((e: any) => e.status === 'COMPLETED');
      if (completed) {
        expect(completed.logs.length).toBeGreaterThan(0);
      }
    });

    it('gets execution detail with steps', async () => {
      const listRes = await request(app.getHttpServer())
        .get(`/workflows/${workflowId}/executions`)
        .set(authAdmin())
        .expect(200);

      const execId = listRes.body.data.items[0].id;
      const res = await request(app.getHttpServer())
        .get(`/workflows/executions/${execId}`)
        .set(authAdmin())
        .expect(200);

      expect(res.body.data.id).toBe(execId);
    });
  });

  describe('Triggers and Actions metadata', () => {
    it('returns trigger definitions', async () => {
      const res = await request(app.getHttpServer())
        .get('/workflows/triggers')
        .set(authAdmin())
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(15);
      const manual = res.body.data.find((t: any) => t.type === 'manual');
      expect(manual).toBeDefined();
      expect(manual.displayName).toBe('Manual Trigger');
    });

    it('returns action definitions', async () => {
      const res = await request(app.getHttpServer())
        .get('/workflows/actions')
        .set(authAdmin())
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(10);
      const email = res.body.data.find((a: any) => a.type === 'send_email');
      expect(email).toBeDefined();
    });
  });

  describe('RBAC', () => {
    it('DISPATCHER can list workflows', async () => {
      await request(app.getHttpServer())
        .get('/workflows')
        .set({ Authorization: `Bearer ${dispatcherToken}` })
        .expect(200);
    });

    it('DISPATCHER cannot create workflows', async () => {
      await request(app.getHttpServer())
        .post('/workflows')
        .set({ Authorization: `Bearer ${dispatcherToken}` })
        .send({ name: 'X', config: { trigger: { event: 'manual' }, actions: [{ type: 'log', config: {} }] } })
        .expect(403);
    });

    it('DRIVER cannot access workflows', async () => {
      await request(app.getHttpServer())
        .get('/workflows')
        .set({ Authorization: `Bearer ${driverToken}` })
        .expect(403);
    });
  });

  describe('Tenant isolation', () => {
    it('cannot see other org workflows', async () => {
      const other = await registerUser(`Other Org ${randomUUID()}`);

      const res = await request(app.getHttpServer())
        .get('/workflows')
        .set({ Authorization: `Bearer ${other.accessToken}` })
        .expect(200);

      const foreignIds = res.body.data.items.filter((w: any) => w.organizationId !== other.organization.id);
      expect(foreignIds).toHaveLength(0);
    });

    it('returns 404 for cross-org workflow access', async () => {
      const other = await registerUser(`Iso Org ${randomUUID()}`);

      await request(app.getHttpServer())
        .get(`/workflows/${workflowId}`)
        .set({ Authorization: `Bearer ${other.accessToken}` })
        .expect(404);
    });
  });
});
