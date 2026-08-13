/// The role × endpoint authorization matrix, asserted against the running API
/// (WS-8).
///
/// One case per (role, endpoint) pair. `allow` lists the membership roles the
/// backend is supposed to admit; every other seeded role must be refused with a
/// 403 by RolesGuard. An admitted role is asserted only as "not 403" — the
/// request may still 404 or 409 on its way through the handler, and that is the
/// point: authorization is what this spec pins down, not business rules.
///
/// Every id-bearing route is aimed at a random UUID that exists in no
/// organization, so an admitted role cannot mutate anything. The matrix is
/// therefore safe to run against the shared disposable database.
///
/// Read this file as the executable version of the permission table in the WS-8
/// report: if a controller's @Roles list changes, a case here fails.

import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { MembershipRole } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.config";
import {
  loginAs,
  SEEDED_ACCOUNTANT_EMAIL,
  SEEDED_ADMIN_EMAIL,
  SEEDED_DISPATCHER_EMAIL,
  SEEDED_DRIVER_EMAIL,
  SEEDED_OPS_MANAGER_EMAIL,
  SEEDED_PLATFORM_EMAIL,
  SEEDED_SALES_EMAIL,
} from "./support/seeded-org";

const ALL_ROLES: MembershipRole[] = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "ACCOUNTANT",
  "SALES_CRM_MANAGER",
  "DRIVER",
];

const STAFF: MembershipRole[] = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "ACCOUNTANT",
  "SALES_CRM_MANAGER",
];
const ADMIN_OPS: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER"];
const FLEET: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];
const DISPATCH_READ: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "ACCOUNTANT"];
const ORDER_WRITE: MembershipRole[] = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "SALES_CRM_MANAGER",
];
const FINANCE_READ: MembershipRole[] = [
  "ADMIN",
  "ACCOUNTANT",
  "OPERATIONS_MANAGER",
  "SALES_CRM_MANAGER",
];
const EXPENSE_ROLES: MembershipRole[] = ["ADMIN", "ACCOUNTANT", "OPERATIONS_MANAGER"];
const FINANCE_APPROVE: MembershipRole[] = ["ADMIN", "ACCOUNTANT"];

interface Case {
  method: "get" | "post" | "patch" | "put" | "delete";
  path: string;
  allow: MembershipRole[];
  body?: Record<string, unknown>;
}

const UNKNOWN = randomUUID();

const CASES: Case[] = [
  // Customers — read is every staff role, write is ADMIN + SALES only.
  { method: "get", path: "/customers", allow: STAFF },
  { method: "get", path: `/customers/${UNKNOWN}`, allow: STAFF },
  {
    method: "post",
    path: "/customers",
    allow: ["ADMIN", "SALES_CRM_MANAGER"],
    body: { customerCode: `RBAC-${UNKNOWN.slice(0, 8)}`, companyName: "x", contactName: "y" },
  },
  {
    method: "patch",
    path: `/customers/${UNKNOWN}`,
    allow: ["ADMIN", "SALES_CRM_MANAGER"],
    body: { contactName: "y" },
  },
  { method: "post", path: `/customers/${UNKNOWN}/archive`, allow: ["ADMIN", "SALES_CRM_MANAGER"] },

  // Orders — ACCOUNTANT reads but never writes; SALES writes fields but not the
  // fulfilment pipeline.
  { method: "get", path: "/orders", allow: STAFF },
  { method: "get", path: `/orders/${UNKNOWN}`, allow: STAFF },
  { method: "patch", path: `/orders/${UNKNOWN}`, allow: ORDER_WRITE, body: { notes: "x" } },
  {
    method: "post",
    path: `/orders/${UNKNOWN}/assign`,
    allow: FLEET,
    body: { driverId: UNKNOWN, vehicleId: UNKNOWN },
  },
  {
    method: "post",
    path: `/orders/${UNKNOWN}/status`,
    allow: FLEET,
    body: { status: "IN_TRANSIT" },
  },
  { method: "post", path: `/orders/${UNKNOWN}/cancel`, allow: FLEET },
  { method: "post", path: `/orders/${UNKNOWN}/archive`, allow: FLEET },

  // Fleet.
  { method: "get", path: "/drivers", allow: FLEET },
  { method: "get", path: `/drivers/${UNKNOWN}`, allow: FLEET },
  { method: "get", path: "/vehicles", allow: FLEET },
  { method: "get", path: `/vehicles/${UNKNOWN}`, allow: FLEET },

  // Dispatch — ACCOUNTANT reads, never writes.
  { method: "get", path: "/dispatches", allow: DISPATCH_READ },
  { method: "get", path: `/dispatches/${UNKNOWN}`, allow: DISPATCH_READ },
  { method: "get", path: "/dispatch/board", allow: DISPATCH_READ },
  { method: "get", path: "/dispatch/availability", allow: DISPATCH_READ },
  {
    method: "post",
    path: "/dispatches",
    allow: FLEET,
    body: { orderId: UNKNOWN, driverId: UNKNOWN, vehicleId: UNKNOWN },
  },
  {
    method: "post",
    path: `/dispatches/${UNKNOWN}/status`,
    allow: FLEET,
    body: { status: "IN_TRANSIT" },
  },
  { method: "post", path: `/dispatches/${UNKNOWN}/cancel`, allow: FLEET },

  // Finance.
  { method: "get", path: "/invoices", allow: FINANCE_READ },
  { method: "get", path: `/invoices/${UNKNOWN}`, allow: FINANCE_READ },
  { method: "post", path: `/invoices/${UNKNOWN}/send`, allow: FINANCE_APPROVE },
  { method: "post", path: `/invoices/${UNKNOWN}/cancel`, allow: FINANCE_APPROVE },
  { method: "get", path: "/payments", allow: FINANCE_READ },
  { method: "get", path: "/expenses", allow: EXPENSE_ROLES },
  { method: "get", path: `/expenses/${UNKNOWN}`, allow: EXPENSE_ROLES },
  { method: "post", path: `/expenses/${UNKNOWN}/approve`, allow: FINANCE_APPROVE },
  {
    method: "post",
    path: `/expenses/${UNKNOWN}/reject`,
    allow: FINANCE_APPROVE,
    body: { rejectionReason: "x" },
  },
  { method: "get", path: "/finance/summary", allow: STAFF },

  // Reports — the finance and telematics report families are narrower than the
  // rest of the module and must not be widened through /reports.
  { method: "get", path: "/reports/executive-overview", allow: STAFF },
  { method: "get", path: "/reports/financial", allow: FINANCE_APPROVE },
  { method: "get", path: "/reports/fleet-telematics", allow: FLEET },

  // Notifications — DRIVER has its own feed under /drivers/me and none here.
  { method: "get", path: "/notifications", allow: STAFF },
  { method: "get", path: "/notifications/unread-count", allow: STAFF },
  { method: "get", path: "/notifications/settings", allow: ["ADMIN"] },
  { method: "patch", path: "/notifications/settings", allow: ["ADMIN"], body: {} },
  { method: "post", path: `/notifications/${UNKNOWN}/read`, allow: STAFF },

  // Tenant audit log.
  { method: "get", path: "/audit", allow: DISPATCH_READ },
  { method: "get", path: `/audit/${UNKNOWN}`, allow: DISPATCH_READ },

  // Telematics: devices and settings are fleet configuration (ADMIN + OPS);
  // live tracking and geofence reads extend to DISPATCHER.
  { method: "get", path: "/telematics/devices", allow: ADMIN_OPS },
  { method: "get", path: `/telematics/devices/${UNKNOWN}`, allow: ADMIN_OPS },
  { method: "get", path: "/telematics/settings", allow: ADMIN_OPS },
  { method: "get", path: "/telematics/geofences", allow: FLEET },
  { method: "get", path: `/telematics/geofences/${UNKNOWN}`, allow: FLEET },
  {
    method: "post",
    path: "/telematics/geofences",
    allow: ADMIN_OPS,
    body: { name: "rbac", type: "CIRCLE", centerLat: 41.3, centerLng: 69.2, radiusM: 100 },
  },
  { method: "get", path: "/telematics/live", allow: FLEET },
  { method: "get", path: "/telematics/trips", allow: FLEET },
  { method: "get", path: "/telematics/alerts", allow: FLEET },
  { method: "get", path: "/telematics/analytics/overview", allow: FLEET },

  // Automation: everyone reads, ADMIN + OPS write.
  { method: "get", path: "/workflows", allow: STAFF },
  { method: "get", path: `/workflows/${UNKNOWN}`, allow: STAFF },
  {
    method: "post",
    path: "/workflows",
    allow: ADMIN_OPS,
    body: { name: "rbac", config: { trigger: { type: "order.created" }, actions: [] } },
  },
  { method: "delete", path: `/workflows/${UNKNOWN}`, allow: ADMIN_OPS },
  { method: "post", path: `/workflows/${UNKNOWN}/publish`, allow: ADMIN_OPS },

  // Developer portal — an API key or webhook is an exfiltration channel, so the
  // whole module is ADMIN + OPS, including the subscription read surface.
  { method: "get", path: "/admin/api-keys", allow: ADMIN_OPS },
  { method: "get", path: "/admin/webhooks", allow: ADMIN_OPS },
  { method: "get", path: "/admin/usage", allow: ADMIN_OPS },
  { method: "get", path: "/developer/subscription", allow: ADMIN_OPS },
  { method: "get", path: "/developer/subscription/quotas", allow: ADMIN_OPS },
  { method: "get", path: "/developer/subscription/rate-limits", allow: ADMIN_OPS },

  // Data import.
  { method: "get", path: "/import/entities", allow: STAFF },
  { method: "get", path: "/import/sessions", allow: STAFF },
  { method: "get", path: `/import/sessions/${UNKNOWN}`, allow: STAFF },

  // Organization settings: the roster is readable by fleet roles (they link
  // driver logins), every mutation is ADMIN-only.
  { method: "get", path: "/organizations/current", allow: ALL_ROLES },
  { method: "get", path: "/organizations/current/members", allow: FLEET },
  { method: "patch", path: "/organizations/current", allow: ["ADMIN"], body: { name: "x" } },
  {
    method: "patch",
    path: `/organizations/current/members/${UNKNOWN}`,
    allow: ["ADMIN"],
    body: { role: "DISPATCHER" },
  },
  { method: "delete", path: `/organizations/current/members/${UNKNOWN}`, allow: ["ADMIN"] },

  // Billing is ADMIN-only.
  { method: "get", path: "/subscriptions", allow: ["ADMIN"] },
  { method: "get", path: "/plans/admin/all", allow: ["ADMIN"] },

  // Driver workspace is DRIVER-only: staff roles use the dispatch board.
  { method: "get", path: "/drivers/me", allow: ["DRIVER"] },
  { method: "get", path: "/dispatches/my", allow: ["DRIVER"] },
  { method: "get", path: "/drivers/me/expenses", allow: ["DRIVER"] },

  // Platform-only surfaces: no membership role reaches these, whatever it is.
  { method: "get", path: "/leads", allow: [] },
  { method: "get", path: "/platform/organizations", allow: [] },
  { method: "get", path: "/platform/dashboard", allow: [] },
  { method: "get", path: "/platform/audit", allow: [] },
  { method: "get", path: "/platform/settings/staff", allow: [] },
  { method: "get", path: "/platform/analytics", allow: [] },
];

describe("RBAC matrix (e2e)", () => {
  let app: INestApplication;
  const tokens = new Map<MembershipRole, string>();
  let platformToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    tokens.set("ADMIN", await loginAs(app, SEEDED_ADMIN_EMAIL));
    tokens.set("OPERATIONS_MANAGER", await loginAs(app, SEEDED_OPS_MANAGER_EMAIL));
    tokens.set("DISPATCHER", await loginAs(app, SEEDED_DISPATCHER_EMAIL));
    tokens.set("ACCOUNTANT", await loginAs(app, SEEDED_ACCOUNTANT_EMAIL));
    tokens.set("SALES_CRM_MANAGER", await loginAs(app, SEEDED_SALES_EMAIL));
    tokens.set("DRIVER", await loginAs(app, SEEDED_DRIVER_EMAIL));
    platformToken = await loginAs(app, SEEDED_PLATFORM_EMAIL);
  });

  afterAll(async () => {
    await app.close();
  });

  function call(testCase: Case, token: string) {
    const req = request(app.getHttpServer())[testCase.method](testCase.path).set(
      "Authorization",
      `Bearer ${token}`,
    );
    return testCase.body ? req.send(testCase.body) : req.send();
  }

  const pairs = CASES.flatMap((testCase) =>
    ALL_ROLES.map(
      (role) =>
        [
          `${role} ${testCase.allow.includes(role) ? "may" : "may not"} ${testCase.method.toUpperCase()} ${testCase.path}`,
          testCase,
          role,
        ] as const,
    ),
  );

  it.each(pairs)("%s", async (_name, testCase, role) => {
    const res = await call(testCase, tokens.get(role)!);
    if (testCase.allow.includes(role)) {
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    } else {
      expect(res.status).toBe(403);
    }
  });

  // A mistyped path answers 404 for everyone, which would let a "may not" row pass
  // for the wrong reason. Collection routes must resolve for at least one role.
  describe("every probed collection route is really mounted", () => {
    it.each(
      CASES.filter((c) => !c.path.includes(UNKNOWN) && c.allow.length > 0).map(
        (c) => [`${c.method.toUpperCase()} ${c.path}`, c] as const,
      ),
    )("%s resolves for a permitted role", async (_name, testCase) => {
      const res = await call(testCase, tokens.get(testCase.allow[0])!);
      // A missing row answers 404 too, so only Nest's own "no such route" body is a failure.
      expect(String((res.body as { message?: unknown }).message ?? "")).not.toMatch(
        /^Cannot (GET|POST|PATCH|PUT|DELETE) /,
      );
    });
  });

  describe("the platform staff flag is what opens the Platform Console", () => {
    it.each([
      "/leads",
      "/platform/organizations",
      "/platform/dashboard",
      "/platform/audit",
      "/platform/settings/staff",
    ])("platform staff may GET %s", async (path) => {
      const res = await request(app.getHttpServer())
        .get(path)
        .set("Authorization", `Bearer ${platformToken}`);
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });

    it("a tenant ADMIN is refused the same routes", async () => {
      for (const path of ["/leads", "/platform/organizations", "/platform/settings/staff"]) {
        await request(app.getHttpServer())
          .get(path)
          .set("Authorization", `Bearer ${tokens.get("ADMIN")!}`)
          .expect(403);
      }
    });
  });

  describe("no protected route answers an unauthenticated caller", () => {
    it.each(
      CASES.filter((c) => c.method === "get" && !c.path.includes(UNKNOWN)).map(
        (c) => c.path as string,
      ),
    )("GET %s without a token", async (path) => {
      await request(app.getHttpServer()).get(path).expect(401);
    });

    it("rejects a structurally valid but unsigned token", async () => {
      const forged = [
        Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
        Buffer.from(JSON.stringify({ sub: UNKNOWN, mid: UNKNOWN, sv: 0 })).toString("base64url"),
        "",
      ].join(".");
      await request(app.getHttpServer())
        .get("/customers")
        .set("Authorization", `Bearer ${forged}`)
        .expect(401);
    });
  });
});
