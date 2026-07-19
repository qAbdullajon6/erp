import { PaymentProviderRegistry } from "./payment-provider.registry";
import { createCipheriv, randomBytes } from "crypto";

function encryptConfig(config: object, secret: string): string {
  const iv = randomBytes(16);
  const key = Buffer.from(secret.substring(0, 32).padEnd(32, "0"));
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(JSON.stringify(config));
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

const APP_SECRET = "test-secret-key-for-encryption-32";

function makePrisma(orgProvider: any = null, systemProvider: any = null) {
  return {
    paymentProviderConfig: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        if (where.organizationId === null) return Promise.resolve(systemProvider);
        return Promise.resolve(orgProvider);
      }),
      findMany: jest.fn().mockResolvedValue(
        [orgProvider, systemProvider].filter(Boolean).map((p) => ({ providerType: p?.providerType })),
      ),
    },
  } as any;
}

describe("PaymentProviderRegistry", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, APP_SECRET };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getProvider()", () => {
    it("returns org-level provider when configured", async () => {
      const config = encryptConfig({ secretKey: "sk_test_123" }, APP_SECRET);
      const prisma = makePrisma({
        providerType: "STRIPE",
        config,
        isActive: true,
        isPrimary: true,
        organizationId: "org-1",
      });
      const registry = new PaymentProviderRegistry(prisma);

      const provider = await registry.getProvider("org-1");
      expect(provider).not.toBeNull();
    });

    it("falls back to system-level provider when org has none", async () => {
      const config = encryptConfig({ secretKey: "sk_system_123" }, APP_SECRET);
      const prisma = makePrisma(null, {
        providerType: "STRIPE",
        config,
        isActive: true,
        isPrimary: true,
        organizationId: null,
      });
      const registry = new PaymentProviderRegistry(prisma);

      const provider = await registry.getProvider("org-1");
      expect(provider).not.toBeNull();
    });

    it("returns null when no provider configured at any level", async () => {
      const prisma = makePrisma(null, null);
      const registry = new PaymentProviderRegistry(prisma);

      const provider = await registry.getProvider("org-1");
      expect(provider).toBeNull();
    });

    it("caches provider for 5 minutes", async () => {
      const config = encryptConfig({ secretKey: "sk_test_123" }, APP_SECRET);
      const prisma = makePrisma({
        providerType: "STRIPE",
        config,
        isActive: true,
        isPrimary: true,
        organizationId: "org-1",
      });
      const registry = new PaymentProviderRegistry(prisma);

      await registry.getProvider("org-1");
      await registry.getProvider("org-1");

      expect(prisma.paymentProviderConfig.findFirst).toHaveBeenCalledTimes(1);
    });

    it("creates Click provider for CLICK type", async () => {
      const config = encryptConfig({
        merchantId: "m123",
        serviceId: "s456",
        secretKey: "sk_click",
        merchantUserId: "mu789",
      }, APP_SECRET);
      const prisma = makePrisma({
        providerType: "CLICK",
        config,
        isActive: true,
        isPrimary: true,
        organizationId: "org-1",
      });
      const registry = new PaymentProviderRegistry(prisma);

      const provider = await registry.getProvider("org-1");
      expect(provider).not.toBeNull();
    });

    it("creates Payme provider for PAYME type", async () => {
      const config = encryptConfig({
        merchantId: "pm123",
        secretKey: "sk_payme",
      }, APP_SECRET);
      const prisma = makePrisma({
        providerType: "PAYME",
        config,
        isActive: true,
        isPrimary: true,
        organizationId: "org-1",
      });
      const registry = new PaymentProviderRegistry(prisma);

      const provider = await registry.getProvider("org-1");
      expect(provider).not.toBeNull();
    });

    it("throws for unsupported provider type", async () => {
      const config = encryptConfig({ key: "test" }, APP_SECRET);
      const prisma = makePrisma({
        providerType: "UNKNOWN",
        config,
        isActive: true,
        isPrimary: true,
        organizationId: "org-1",
      });
      const registry = new PaymentProviderRegistry(prisma);

      await expect(registry.getProvider("org-1")).rejects.toThrow(/Unsupported payment provider/);
    });
  });

  describe("decryption", () => {
    it("throws when APP_SECRET is not configured", async () => {
      delete process.env.APP_SECRET;
      const prisma = makePrisma({
        providerType: "STRIPE",
        config: "invalid",
        isActive: true,
        isPrimary: true,
        organizationId: "org-1",
      });
      const registry = new PaymentProviderRegistry(prisma);

      await expect(registry.getProvider("org-1")).rejects.toThrow(/APP_SECRET not configured/);
    });

    it("throws for malformed encrypted config", async () => {
      const prisma = makePrisma({
        providerType: "STRIPE",
        config: "not-valid-encrypted-data",
        isActive: true,
        isPrimary: true,
        organizationId: "org-1",
      });
      const registry = new PaymentProviderRegistry(prisma);

      await expect(registry.getProvider("org-1")).rejects.toThrow(/Failed to decrypt/);
    });
  });

  describe("clearCache()", () => {
    it("forces fresh lookup after cache clear", async () => {
      const config = encryptConfig({ secretKey: "sk_test_123" }, APP_SECRET);
      const prisma = makePrisma({
        providerType: "STRIPE",
        config,
        isActive: true,
        isPrimary: true,
        organizationId: "org-1",
      });
      const registry = new PaymentProviderRegistry(prisma);

      await registry.getProvider("org-1");
      registry.clearCache("org-1");
      await registry.getProvider("org-1");

      expect(prisma.paymentProviderConfig.findFirst).toHaveBeenCalledTimes(2);
    });

    it("clears all caches when no organizationId specified", async () => {
      const config = encryptConfig({ secretKey: "sk_test_123" }, APP_SECRET);
      const prisma = makePrisma({
        providerType: "STRIPE",
        config,
        isActive: true,
        isPrimary: true,
        organizationId: "org-1",
      });
      const registry = new PaymentProviderRegistry(prisma);

      await registry.getProvider("org-1");
      registry.clearCache();
      await registry.getProvider("org-1");

      expect(prisma.paymentProviderConfig.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  describe("listProviders()", () => {
    it("returns provider types for an organization", async () => {
      const config = encryptConfig({ secretKey: "sk_test" }, APP_SECRET);
      const prisma = makePrisma(
        { providerType: "STRIPE", config, isActive: true, isPrimary: true, organizationId: "org-1" },
        { providerType: "CLICK", config, isActive: true, isPrimary: true, organizationId: null },
      );
      const registry = new PaymentProviderRegistry(prisma);

      const types = await registry.listProviders("org-1");
      expect(types).toContain("STRIPE");
      expect(types).toContain("CLICK");
    });
  });
});
