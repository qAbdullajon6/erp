/// The fixture the e2e suite authenticates against.
///
/// Created by prisma/seed-test-org.ts, which scripts/e2e-db.mjs runs when it
/// provisions a disposable database. Specs previously hard-coded credentials
/// that no seed in this repository creates (admin@test.com / "password" in an
/// org slugged "test-org"), so they only ever passed on a machine where
/// somebody had created those rows by hand. Keeping the fixture in one place
/// means a seed change breaks compilation rather than producing a cascade of
/// 401s at runtime.

import type { INestApplication } from "@nestjs/common";
import request from "supertest";

export const SEEDED_ORG_SLUG = "flowerp-test-logistics";
export const SEEDED_PASSWORD = "FlowERP-Test-2026!";

export const SEEDED_ADMIN_EMAIL = "admin@flowerp.test";
export const SEEDED_OPS_MANAGER_EMAIL = "ops-manager@flowerp.test";
export const SEEDED_DISPATCHER_EMAIL = "dispatcher@flowerp.test";
export const SEEDED_ACCOUNTANT_EMAIL = "accountant@flowerp.test";
export const SEEDED_SALES_EMAIL = "sales@flowerp.test";
export const SEEDED_DRIVER_EMAIL = "driver@flowerp.test";
export const SEEDED_PLATFORM_EMAIL = "platform@flowerp.test";

interface LoginBody {
  data?: { accessToken?: string };
  accessToken?: string;
}

/// Logs in and returns an access token, failing loudly if authentication did
/// not succeed. Specs used to read `res.body.accessToken` straight into a
/// variable; when login failed that variable was `undefined` and every later
/// request failed with an unrelated 401, hiding the real cause.
export async function loginAs(
  app: INestApplication,
  email: string,
  password: string = SEEDED_PASSWORD,
): Promise<string> {
  const res = await request(app.getHttpServer()).post("/auth/login").send({ email, password });

  const body = res.body as LoginBody;
  const token = body.data?.accessToken ?? body.accessToken;

  if (res.status !== 200 && res.status !== 201) {
    throw new Error(
      `Login failed for ${email} (HTTP ${res.status}). ` +
        "Is the disposable database seeded? Provision it with: node scripts/e2e-db.mjs create",
    );
  }
  if (!token) {
    throw new Error(`Login for ${email} returned no access token. Response: ${JSON.stringify(res.body)}`);
  }
  return token;
}
