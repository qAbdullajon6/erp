import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';
import type { CurrentUserPayload } from '../src/auth/interfaces/current-user.interface';

interface AuthResultBody {
  data: {
    accessToken: string;
    user: { id: string };
    organization: { id: string };
    membership: { id: string; role: string };
  };
}

interface ParseBody {
  sessionId: string;
  headers: string[];
  totalRows: number;
  preview: Record<string, unknown>[];
  defaultMapping: Record<string, string>;
  savedTemplates: Array<{ id: string; name: string }>;
  columnDefinitions: Array<{ fieldName: string; required: boolean }>;
}

interface ValidateBody {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warnings: number;
  duplicates: number;
  newRecords: number;
  ignoredColumns: string[];
  errors: Array<{ row: number; column: string; message: string; severity: string }>;
  preview: { valid: Record<string, unknown>[]; invalid: Record<string, unknown>[] };
}

interface SessionBody {
  id: string;
  status: string;
  entityType: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  processedRows: number;
  successfulRows: number;
  updatedRows: number;
  skippedRows: number;
  failedRows: number;
  errorMessage: string | null;
  executionMs: number | null;
  columnMapping: Record<string, string> | null;
}

function unwrap<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

function uniqueEmail(): string {
  return `imp-test-${randomUUID()}@example.com`;
}

describe('Import Wizard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const createdOrganizationIds: string[] = [];
  const createdUserIds: string[] = [];

  let adminToken: string;
  let adminActor: CurrentUserPayload;
  let otherToken: string;
  let driverToken: string;

  const RUN = Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const admin = await registerUser(`Imp Test Org ${randomUUID()}`);
    adminToken = admin.accessToken;
    adminActor = {
      userId: admin.user.id,
      membershipId: admin.membership.id,
      organizationId: admin.organization.id,
      role: 'ADMIN',
      email: '',
      isPlatformAdmin: false,
    };

    const other = await registerUser(`Imp Other Org ${randomUUID()}`);
    otherToken = other.accessToken;

    driverToken = await addMemberWithRole(admin, 'DRIVER');
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.importError.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.importRow.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.importSession.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.importMapping.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.orderStatusHistory.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.order.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.expense.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.customer.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.driver.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.vehicle.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.auditLog.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.membership.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (app) await app.close();
  });

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
    const body = login.body as AuthResultBody;
    createdUserIds.push(body.data.user.id);
    return body.data.accessToken;
  }

  const upload = (entityType: string, csv: string, name = 'data.csv', token = adminToken) =>
    request(app.getHttpServer())
      .post('/import/sessions')
      .set('Authorization', `Bearer ${token}`)
      .field('entityType', entityType)
      .attach('file', Buffer.from(csv), name);

  /// Polls until the session reaches a terminal state.
  ///
  /// Execution is asynchronous by design — `execute` only marks the session
  /// EXECUTING and returns, and the work continues after the response. Calling
  /// ImportExecutionService.run() directly here instead would race the
  /// background run that `start` already scheduled: both would drain the same
  /// rows, and whichever finished first would settle the session with a partial
  /// tally.
  async function waitForTerminal(sessionId: string, timeoutMs = 60_000): Promise<SessionBody> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const session = unwrap<SessionBody>(
        await request(app.getHttpServer())
          .get(`/import/sessions/${sessionId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200),
      );
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(session.status)) return session;
      if (Date.now() > deadline) {
        throw new Error(`Import ${sessionId} stuck in ${session.status} after ${timeoutMs}ms`);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  /// Upload -> map -> validate -> execute -> wait for the real outcome.
  async function runImport(entityType: string, csv: string, strategy = 'SKIP') {
    const parsed = unwrap<ParseBody>(await upload(entityType, csv).expect(201));

    await request(app.getHttpServer())
      .put(`/import/sessions/${parsed.sessionId}/mapping`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ columnMapping: parsed.defaultMapping })
      .expect(200);

    const validated = unwrap<ValidateBody>(
      await request(app.getHttpServer())
        .post(`/import/sessions/${parsed.sessionId}/validate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200),
    );

    await request(app.getHttpServer())
      .post(`/import/sessions/${parsed.sessionId}/execute`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ duplicateStrategy: strategy })
      .expect(200);

    const session = await waitForTerminal(parsed.sessionId);
    return { parsed, validated, session };
  }

  // ── Registry ────────────────────────────────────────────────────

  describe('entity registry', () => {
    it('exposes all five importable entities to an admin', () => {
      return request(app.getHttpServer())
        .get('/import/entities')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const items = unwrap<{ items: Array<{ entityType: string }> }>(res).items;
          expect(items.map((i) => i.entityType).sort()).toEqual(
            ['Customer', 'Driver', 'Expense', 'Order', 'Vehicle'].sort(),
          );
        });
    });

    it('offers a DRIVER nothing, rather than options that would 403', () => {
      // The dropdown is built from this; listing an entity the user cannot
      // import is a worse experience than not listing it.
      return request(app.getHttpServer())
        .get('/import/entities')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(403);
    });
  });

  // ── File handling ───────────────────────────────────────────────

  describe('file validation', () => {
    it('rejects an upload with no file', () =>
      request(app.getHttpServer())
        .post('/import/sessions')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('entityType', 'Customer')
        .expect(400));

    it('rejects an unknown entity type', () =>
      upload('Unicorn', 'a\n1').expect(400));

    it('rejects an empty file', () => upload('Customer', '').expect(400));

    it('rejects a header-only file', () =>
      upload('Customer', 'Company Name,Contact Name\n').expect(400));

    it('rejects duplicate column headers rather than silently dropping one', async () => {
      // Papa's header mode renames the second to "Company Name_1"; that would
      // map to nothing and drop the column without telling anyone.
      const res = await upload('Customer', 'Company Name,Company Name\nA,B').expect(400);
      expect(JSON.stringify(res.body)).toMatch(/duplicate column header/i);
    });

    it('sniffs content, not the extension', async () => {
      // A zip named .csv must not be fed to the CSV parser.
      const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
      const res = await request(app.getHttpServer())
        .post('/import/sessions')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('entityType', 'Customer')
        .attach('file', zip, 'lying.csv');
      expect(res.status).toBe(400);
    });

    it('rejects a corrupt workbook as a 400, not a 500', async () => {
      const notAWorkbook = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        Buffer.from('this is not really a workbook'),
      ]);
      const res = await request(app.getHttpServer())
        .post('/import/sessions')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('entityType', 'Customer')
        .attach('file', notAWorkbook, 'broken.xlsx');
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/could not be read|not a valid/i);
    });
  });

  // ── Mapping ─────────────────────────────────────────────────────

  describe('mapping', () => {
    it('auto-maps exact names and aliases, and leaves unknown columns alone', async () => {
      const parsed = unwrap<ParseBody>(
        await upload(
          'Customer',
          'Company Name,Contact Person,E-Mail,Telephone,Unmapped Junk\nAcme,Jane,j@a.com,+15550109999,zz',
        ).expect(201),
      );
      expect(parsed.defaultMapping['0']).toBe('companyName');
      expect(parsed.defaultMapping['1']).toBe('contactName');
      expect(parsed.defaultMapping['2']).toBe('email');
      expect(parsed.defaultMapping['3']).toBe('phone');
      expect(parsed.defaultMapping['4']).toBeUndefined();
    });

    it('rejects a mapping that misses a required field', async () => {
      const parsed = unwrap<ParseBody>(
        await upload('Customer', 'Company Name,Contact Name\nAcme,Jane').expect(201),
      );
      const res = await request(app.getHttpServer())
        .put(`/import/sessions/${parsed.sessionId}/mapping`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ columnMapping: { 0: 'companyName' } })
        .expect(400);
      expect(JSON.stringify(res.body)).toMatch(/Contact Name/);
    });

    it('rejects two columns mapped to one field', async () => {
      const parsed = unwrap<ParseBody>(
        await upload('Customer', 'A,B\nx,y').expect(201),
      );
      await request(app.getHttpServer())
        .put(`/import/sessions/${parsed.sessionId}/mapping`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ columnMapping: { 0: 'companyName', 1: 'companyName' } })
        .expect(400);
    });

    it('rejects a mapping naming a field the entity does not have', async () => {
      const parsed = unwrap<ParseBody>(
        await upload('Customer', 'Company Name,Contact Name\nAcme,Jane').expect(201),
      );
      await request(app.getHttpServer())
        .put(`/import/sessions/${parsed.sessionId}/mapping`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ columnMapping: { 0: 'companyName', 1: 'contactName', 2: 'notAField' } })
        .expect(400);
    });

    it('persists the mapping so validation uses what the USER chose', async () => {
      // The wizard collected this and never sent it, so every manual mapping
      // decision was silently discarded in favour of the auto-detected guess.
      const parsed = unwrap<ParseBody>(
        await upload('Customer', 'Col A,Col B\nAcme,Jane').expect(201),
      );
      // Neither header auto-maps; the user maps them by hand.
      expect(Object.keys(parsed.defaultMapping)).toHaveLength(0);

      await request(app.getHttpServer())
        .put(`/import/sessions/${parsed.sessionId}/mapping`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ columnMapping: { 0: 'companyName', 1: 'contactName' } })
        .expect(200);

      const session = unwrap<SessionBody>(
        await request(app.getHttpServer())
          .get(`/import/sessions/${parsed.sessionId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200),
      );
      expect(session.columnMapping).toEqual({ 0: 'companyName', 1: 'contactName' });

      const validated = unwrap<ValidateBody>(
        await request(app.getHttpServer())
          .post(`/import/sessions/${parsed.sessionId}/validate`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200),
      );
      expect(validated.validRows).toBe(1);
    });

    it('saves and re-offers a mapping template, keyed by header not position', async () => {
      const parsed = unwrap<ParseBody>(
        await upload('Customer', 'Col A,Col B\nAcme,Jane').expect(201),
      );
      await request(app.getHttpServer())
        .post(`/import/sessions/${parsed.sessionId}/mapping/save-template`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `T-${RUN}`, columnMapping: { 0: 'companyName', 1: 'contactName' } })
        .expect(201);

      // A later file with the SAME headers in a DIFFERENT order still matches.
      const next = unwrap<ParseBody>(
        await upload('Customer', 'Col B,Col A\nJane,Acme').expect(201),
      );
      const template = next.savedTemplates.find((t) => t.name === `T-${RUN}`);
      expect(template).toBeDefined();
    });
  });

  // ── Validation ──────────────────────────────────────────────────

  describe('validation', () => {
    it('reports every kind of bad cell, and keeps the good row', async () => {
      const csv = [
        'Customer Code,Company Name,Contact Name,Email,Phone,Credit Limit,Status',
        `V-${RUN}-1,,No Company,bad-email,123,notanumber,NOPE`,
        `V-${RUN}-2,Neg Co,Neg,n@n.test,+15550100001,-5,ACTIVE`,
        `V-${RUN}-3,Good Co,Good,g@g.test,+15550100002,100,ACTIVE`,
      ].join('\n');

      const parsed = unwrap<ParseBody>(await upload('Customer', csv).expect(201));
      await request(app.getHttpServer())
        .put(`/import/sessions/${parsed.sessionId}/mapping`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ columnMapping: parsed.defaultMapping })
        .expect(200);

      const v = unwrap<ValidateBody>(
        await request(app.getHttpServer())
          .post(`/import/sessions/${parsed.sessionId}/validate`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200),
      );

      const messages = JSON.stringify(v.errors);
      expect(messages).toMatch(/Company Name is required/);
      expect(messages).toMatch(/valid email/);
      expect(messages).toMatch(/valid phone/);
      expect(messages).toMatch(/must be a number/);
      expect(messages).toMatch(/must be one of/);
      expect(messages).toMatch(/cannot be negative/);
      expect(v.validRows).toBe(1);
      expect(v.invalidRows).toBe(2);
    });

    it('errors on a natural key repeated within the file', async () => {
      // No duplicate strategy makes "two rows claiming one code" coherent, so
      // this is an error in the file rather than a decision for the user.
      const csv = [
        'Customer Code,Company Name,Contact Name',
        `D-${RUN},First Co,A`,
        `D-${RUN},Second Co,B`,
      ].join('\n');
      const { validated } = await runImport('Customer', csv);
      expect(validated.invalidRows).toBe(1);
      expect(JSON.stringify(validated.errors)).toMatch(/appears more than once/);
    });

    it('warns (not errors) when a row matches an existing record', async () => {
      const csv = ['Customer Code,Company Name,Contact Name', `W-${RUN},Warn Co,A`].join('\n');
      await runImport('Customer', csv);

      const second = await runImport('Customer', csv);
      // A duplicate is a decision, not invalid data — failing validation would
      // take the strategy choice away from the user.
      expect(second.validated.validRows).toBe(1);
      expect(second.validated.invalidRows).toBe(0);
      expect(second.validated.duplicates).toBe(1);
      expect(second.validated.warnings).toBeGreaterThanOrEqual(1);
    });

    it('reports which columns will be ignored', async () => {
      const parsed = unwrap<ParseBody>(
        await upload('Customer', 'Company Name,Contact Name,Legacy Notes\nAcme,Jane,zz').expect(201),
      );
      await request(app.getHttpServer())
        .put(`/import/sessions/${parsed.sessionId}/mapping`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ columnMapping: parsed.defaultMapping })
        .expect(200);
      const v = unwrap<ValidateBody>(
        await request(app.getHttpServer())
          .post(`/import/sessions/${parsed.sessionId}/validate`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200),
      );
      expect(v.ignoredColumns).toContain('Legacy Notes');
    });
  });

  // ── Execution: every entity type ────────────────────────────────

  describe('execution', () => {
    it('imports customers', async () => {
      const csv = [
        'Customer Code,Company Name,Contact Name,Email,Credit Limit,Status',
        `C-${RUN}-1,Alpha,Ann,a${RUN}@x.test,1000,ACTIVE`,
        `C-${RUN}-2,Beta,Bob,b${RUN}@x.test,2000,AT_RISK`,
      ].join('\n');
      const { session } = await runImport('Customer', csv);
      expect(session.status).toBe('COMPLETED');
      expect(session.successfulRows).toBe(2);
      expect(session.executionMs).toEqual(expect.any(Number));
    });

    it('imports drivers and vehicles', async () => {
      const drivers = [
        'Employee Code,First Name,Last Name,Phone,Status',
        `DR-${RUN}-1,Ivan,Petrov,+998901234501,ACTIVE`,
      ].join('\n');
      expect((await runImport('Driver', drivers)).session.successfulRows).toBe(1);

      const vehicles = [
        'Vehicle Code,Plate Number,Type,Capacity Kg,Status',
        `VE-${RUN}-1,01A${RUN % 1000}XX,Truck,20000,AVAILABLE`,
      ].join('\n');
      expect((await runImport('Vehicle', vehicles)).session.successfulRows).toBe(1);
    });

    it('imports expenses, resolving driver and vehicle by code', async () => {
      const csv = [
        'Expense Number,Date,Category,Description,Amount,Currency,Driver,Vehicle',
        `EX-${RUN}-1,2026-07-01,FUEL,Diesel,450.50,USD,DR-${RUN}-1,VE-${RUN}-1`,
      ].join('\n');
      const { session } = await runImport('Expense', csv);
      expect(session.status).toBe('COMPLETED');
      expect(session.successfulRows).toBe(1);

      const expense = await prisma.expense.findFirst({
        where: { expenseNumber: `EX-${RUN}-1` },
      });
      expect(expense?.driverId).toBeTruthy();
      expect(expense?.vehicleId).toBeTruthy();
    });

    it('imports orders and gives each one its opening history row (ADR-001)', async () => {
      const csv = [
        'Order Number,Customer,Pickup Address,Pickup City,Pickup Date,Delivery Address,Delivery City,Delivery Date,Cargo Description,Price',
        `OR-${RUN}-1,C-${RUN}-1,1 A St,Tashkent,2026-09-01,2 B St,Samarkand,2026-09-03,Pallets,1500`,
        `OR-${RUN}-2,Beta,3 C St,Tashkent,2026-09-02,4 D St,Bukhara,2026-09-05,Boxes,2200`,
      ].join('\n');
      const { session } = await runImport('Order', csv);
      expect(session.status).toBe('COMPLETED');
      expect(session.successfulRows).toBe(2);

      const order = await prisma.order.findFirst({ where: { orderNumber: `OR-${RUN}-1` } });
      expect(order?.status).toBe('DRAFT');

      // Without the registry's postCreateHook this row would not exist, and the
      // order would be invisible to the projection and the dispatch board.
      const history = await prisma.orderStatusHistory.findMany({
        where: { orderId: order!.id },
      });
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('DRAFT');
    });

    it('resolves a reference by name as well as by code', async () => {
      // "Beta" above is a company name, not a code — a human migrating data
      // writes whichever they have.
      const order = await prisma.order.findFirst({ where: { orderNumber: `OR-${RUN}-2` } });
      expect(order?.customerId).toBeTruthy();
    });

    it('rejects an unknown reference and names the value the user typed', async () => {
      const csv = [
        'Order Number,Customer,Pickup Address,Pickup City,Pickup Date,Delivery Address,Delivery City,Delivery Date,Cargo Description,Price',
        `BAD-${RUN}-1,NO-SUCH-CUSTOMER,1 A,T,2026-09-01,2 B,S,2026-09-03,X,10`,
      ].join('\n');
      const { validated } = await runImport('Order', csv);
      expect(validated.invalidRows).toBe(1);
      expect(JSON.stringify(validated.errors)).toMatch(/NO-SUCH-CUSTOMER/);
    });

    it('generates natural keys for rows that supply none', async () => {
      const csv = ['Company Name,Contact Name', `Auto ${RUN} A,A`, `Auto ${RUN} B,B`].join('\n');
      const { session } = await runImport('Customer', csv);
      expect(session.successfulRows).toBe(2);

      const created = await prisma.customer.findMany({
        where: { companyName: { startsWith: `Auto ${RUN}` } },
        select: { customerCode: true },
      });
      expect(created).toHaveLength(2);
      for (const c of created) expect(c.customerCode).toMatch(/^CUS-\d{4}$/);
      expect(new Set(created.map((c) => c.customerCode)).size).toBe(2);
    });
  });

  // ── Duplicate strategies ────────────────────────────────────────

  describe('duplicate strategies', () => {
    const csv = (suffix: string) =>
      ['Customer Code,Company Name,Contact Name', `S-${RUN},${suffix},Contact`].join('\n');

    it('SKIP leaves the existing record untouched', async () => {
      await runImport('Customer', csv('Original'));
      const { session } = await runImport('Customer', csv('Changed'), 'SKIP');
      expect(session.skippedRows).toBe(1);
      expect(session.successfulRows).toBe(0);

      const row = await prisma.customer.findFirst({ where: { customerCode: `S-${RUN}` } });
      expect(row?.companyName).toBe('Original');
    });

    it('UPDATE overwrites it', async () => {
      const { session } = await runImport('Customer', csv('Updated Name'), 'UPDATE');
      expect(session.updatedRows).toBe(1);

      const row = await prisma.customer.findFirst({ where: { customerCode: `S-${RUN}` } });
      expect(row?.companyName).toBe('Updated Name');
    });

    it('ERROR fails the whole import and says why', async () => {
      const { session } = await runImport('Customer', csv('Whatever'), 'ERROR');
      expect(session.status).toBe('FAILED');
      expect(session.errorMessage).toMatch(/already exists/);
    });

    it('UPDATE never moves a record between organizations', async () => {
      const row = await prisma.customer.findFirst({ where: { customerCode: `S-${RUN}` } });
      expect(row?.organizationId).toBe(adminActor.organizationId);
    });
  });

  // ── Lifecycle ───────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('execute returns EXECUTING immediately rather than blocking', async () => {
      const csv = ['Customer Code,Company Name,Contact Name', `L-${RUN}-1,Life Co,L`].join('\n');
      const parsed = unwrap<ParseBody>(await upload('Customer', csv).expect(201));
      await request(app.getHttpServer())
        .put(`/import/sessions/${parsed.sessionId}/mapping`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ columnMapping: parsed.defaultMapping })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/import/sessions/${parsed.sessionId}/validate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/import/sessions/${parsed.sessionId}/execute`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ duplicateStrategy: 'SKIP' })
        .expect(200);
      expect(unwrap<SessionBody>(res).status).toBe('EXECUTING');

      await waitForTerminal(parsed.sessionId);
    });

    it('refuses to execute a session that has not been validated', async () => {
      const parsed = unwrap<ParseBody>(
        await upload('Customer', 'Company Name,Contact Name\nAcme,Jane').expect(201),
      );
      await request(app.getHttpServer())
        .post(`/import/sessions/${parsed.sessionId}/execute`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ duplicateStrategy: 'SKIP' })
        .expect(409);
    });

    it('a double-clicked Execute cannot run the import twice', async () => {
      const csv = ['Customer Code,Company Name,Contact Name', `DB-${RUN}-1,Double Co,D`].join('\n');
      const parsed = unwrap<ParseBody>(await upload('Customer', csv).expect(201));
      await request(app.getHttpServer())
        .put(`/import/sessions/${parsed.sessionId}/mapping`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ columnMapping: parsed.defaultMapping })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/import/sessions/${parsed.sessionId}/validate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const [first, second] = await Promise.all([
        request(app.getHttpServer())
          .post(`/import/sessions/${parsed.sessionId}/execute`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ duplicateStrategy: 'SKIP' }),
        request(app.getHttpServer())
          .post(`/import/sessions/${parsed.sessionId}/execute`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ duplicateStrategy: 'SKIP' }),
      ]);
      // The compare-and-set claim means exactly one wins.
      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([200, 409]);

      await waitForTerminal(parsed.sessionId);
      const rows = await prisma.customer.findMany({ where: { customerCode: `DB-${RUN}-1` } });
      expect(rows).toHaveLength(1);
    });

    it('cancels a pending session outright', async () => {
      const parsed = unwrap<ParseBody>(
        await upload('Customer', 'Company Name,Contact Name\nCancel Me,C').expect(201),
      );
      const res = await request(app.getHttpServer())
        .post(`/import/sessions/${parsed.sessionId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(unwrap<SessionBody>(res).status).toBe('CANCELLED');
    });

    it('resumes a cancelled session and finishes it', async () => {
      const csv = ['Customer Code,Company Name,Contact Name', `RS-${RUN}-1,Resume Co,R`].join('\n');
      const parsed = unwrap<ParseBody>(await upload('Customer', csv).expect(201));
      await request(app.getHttpServer())
        .put(`/import/sessions/${parsed.sessionId}/mapping`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ columnMapping: parsed.defaultMapping })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/import/sessions/${parsed.sessionId}/validate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/import/sessions/${parsed.sessionId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/import/sessions/${parsed.sessionId}/resume`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const session = await waitForTerminal(parsed.sessionId);
      expect(session.status).toBe('COMPLETED');
      expect(session.successfulRows).toBe(1);
    });

    it('refuses to resume a completed import', async () => {
      const csv = ['Customer Code,Company Name,Contact Name', `RC-${RUN}-1,Done Co,D`].join('\n');
      const { parsed } = await runImport('Customer', csv);
      await request(app.getHttpServer())
        .post(`/import/sessions/${parsed.sessionId}/resume`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
    });

    it('refuses to retry an import with no failed rows', async () => {
      const csv = ['Customer Code,Company Name,Contact Name', `RT-${RUN}-1,NoFail Co,N`].join('\n');
      const { parsed } = await runImport('Customer', csv);
      await request(app.getHttpServer())
        .post(`/import/sessions/${parsed.sessionId}/retry`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
    });
  });

  // ── Reports ─────────────────────────────────────────────────────

  describe('reports', () => {
    it('serves the error report as a real CSV, not a JSON envelope', async () => {
      // Every other route is wrapped in { data: ... } by TransformInterceptor;
      // doing that to a download produces a file whose bytes are JSON, which
      // the browser still saves as .csv and Excel then opens as garbage.
      const csv = ['Company Name,Contact Name', ',Missing Company'].join('\n');
      const parsed = unwrap<ParseBody>(await upload('Customer', csv).expect(201));
      await request(app.getHttpServer())
        .put(`/import/sessions/${parsed.sessionId}/mapping`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ columnMapping: parsed.defaultMapping })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/import/sessions/${parsed.sessionId}/validate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/import/sessions/${parsed.sessionId}/errors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment/);
      expect(res.text).not.toMatch(/^\{"data"/);
      expect(res.text).toContain('"Row","Column","Severity","Message","Value"');
      expect(res.text).toContain('is required');
    });

    it('serves a template per entity type', async () => {
      for (const entityType of ['Customer', 'Order', 'Driver', 'Vehicle', 'Expense']) {
        const res = await request(app.getHttpServer())
          .get(`/import/sessions/template/${entityType}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
        expect(res.headers['content-type']).toMatch(/text\/csv/);
        // Required fields are starred so the user knows what they must fill in.
        expect(res.text).toContain('*');
        expect(res.text).not.toMatch(/^\{"data"/);
      }
    });

    it('neutralises a formula payload in a generated report', async () => {
      const csv = ['Company Name,Contact Name', `=cmd|'/c calc'!A1,Evil`].join('\n');
      const parsed = unwrap<ParseBody>(await upload('Customer', csv).expect(201));
      await request(app.getHttpServer())
        .put(`/import/sessions/${parsed.sessionId}/mapping`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ columnMapping: parsed.defaultMapping })
        .expect(200);
      const v = unwrap<ValidateBody>(
        await request(app.getHttpServer())
          .post(`/import/sessions/${parsed.sessionId}/validate`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200),
      );
      // Imported as text, and the user is told so rather than having their data
      // silently rewritten.
      expect(v.validRows).toBe(1);
      expect(JSON.stringify(v.errors)).toMatch(/formula/i);

      const res = await request(app.getHttpServer())
        .get(`/import/sessions/${parsed.sessionId}/errors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.text).not.toMatch(/(^|,)"=cmd/);
      expect(res.text).toMatch(/"'=cmd/);
    });
  });

  // ── Security ────────────────────────────────────────────────────

  describe('security', () => {
    it('rejects an unauthenticated request', () =>
      request(app.getHttpServer()).get('/import/sessions').expect(401));

    it('refuses an entity the role may not import', async () => {
      // ACCOUNTANT may import expenses but not vehicles; the registry, not the
      // controller, decides.
      const accountantToken = await addMemberWithRole(
        { accessToken: adminToken, organization: { id: adminActor.organizationId } },
        'ACCOUNTANT',
      );
      await upload('Vehicle', 'Plate Number,Type\n01A,Truck', 'v.csv', accountantToken).expect(403);
      await upload(
        'Expense',
        'Date,Category,Description,Amount\n2026-07-01,FUEL,x,10',
        'e.csv',
        accountantToken,
      ).expect(201);
    });

    it("cannot read another organization's session", async () => {
      const csv = ['Customer Code,Company Name,Contact Name', `IS-${RUN}-1,Iso Co,I`].join('\n');
      const { parsed } = await runImport('Customer', csv);

      await request(app.getHttpServer())
        .get(`/import/sessions/${parsed.sessionId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/import/sessions/${parsed.sessionId}/errors`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .post(`/import/sessions/${parsed.sessionId}/execute`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ duplicateStrategy: 'SKIP' })
        .expect(409);
    });

    it("does not list another organization's history", async () => {
      const res = await request(app.getHttpServer())
        .get('/import/sessions')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);
      expect(unwrap<{ items: unknown[] }>(res).items).toHaveLength(0);
    });
  });

  // ── Audit ───────────────────────────────────────────────────────

  describe('audit', () => {
    it('records the whole lifecycle', async () => {
      const csv = ['Customer Code,Company Name,Contact Name', `AU-${RUN}-1,Audit Co,A`].join('\n');
      const { parsed } = await runImport('Customer', csv);

      const logs = await prisma.auditLog.findMany({
        where: { entityType: 'ImportSession', entityId: parsed.sessionId },
      });
      expect(logs.map((l) => l.action).sort()).toEqual(
        ['import.execute', 'import.upload', 'import.validate'].sort(),
      );
      const upload = logs.find((l) => l.action === 'import.upload')!;
      expect(upload.actorUserId).toBe(adminActor.userId);
      expect(upload.organizationId).toBe(adminActor.organizationId);
    });
  });

  // ── History ─────────────────────────────────────────────────────

  describe('history', () => {
    it('lists newest first and paginates', async () => {
      const res = await request(app.getHttpServer())
        .get('/import/sessions?limit=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body = unwrap<{ items: SessionBody[]; meta: { limit: number; totalPages: number } }>(res);
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items.length).toBeLessThanOrEqual(5);
      expect(body.meta.limit).toBe(5);
    });

    it('filters by entity type', async () => {
      const res = await request(app.getHttpServer())
        .get('/import/sessions?entityType=Driver&limit=50')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const items = unwrap<{ items: SessionBody[] }>(res).items;
      expect(items.every((s) => s.entityType === 'Driver')).toBe(true);
    });

    it('rejects an unknown entity-type filter', () =>
      request(app.getHttpServer())
        .get('/import/sessions?entityType=Unicorn')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400));
  });
});
