import { test as base, expect } from '@playwright/test';
import {
  loginAs,
  seedBrowserSession,
  type AuthTokens,
  type StaffRole,
} from '../helpers';

type Fixtures = {
  /** Admin session tokens (memoized). */
  adminTokens: AuthTokens;
  /** Page with admin tokens injected before navigation. */
  asAdmin: void;
  /** Factory: login as any staff role and inject session. */
  asRole: (role: StaffRole) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  adminTokens: async ({ request }, use) => {
    const tokens = await loginAs(request, 'ADMIN');
    await use(tokens);
  },

  asAdmin: async ({ page, adminTokens }, use) => {
    await seedBrowserSession(page, adminTokens);
    await use();
  },

  asRole: async ({ page, request }, use) => {
    await use(async (role: StaffRole) => {
      const tokens = await loginAs(request, role);
      await seedBrowserSession(page, tokens);
    });
  },
});

export { expect };
