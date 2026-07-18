import { Injectable, Logger } from "@nestjs/common";
import { createDecipheriv } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentProviderType } from "@prisma/client";
import { PaymentProvider } from "./providers/payment-provider.interface";
import { StripePaymentProvider } from "./providers/stripe.provider";
import { ClickPaymentProvider } from "./providers/click.provider";
import { PaymePaymentProvider } from "./providers/payme.provider";

/// Payment provider registry - follows EmailProviderRegistry pattern exactly.
///
/// Responsibilities:
/// - Load provider config from DB (org-level or system-level)
/// - Decrypt credentials (AES-256-CBC with APP_SECRET)
/// - Instantiate provider class (Stripe/Click/Payme)
/// - Cache providers per organization (5-minute TTL)
/// - Fallback to system provider if org has none
///
/// Usage:
///   const provider = await registry.getProvider(organizationId);
///   if (!provider) throw new Error('No payment provider configured');
///   const result = await provider.charge({ amount, customerId, ... });
///
/// Configuration:
/// - Org-level: PaymentProviderConfig with organizationId set
/// - System-level: PaymentProviderConfig with organizationId=null (fallback)
/// - Encrypted config JSON stored in 'config' field
/// - Decrypted in-memory only, never logged
@Injectable()
export class PaymentProviderRegistry {
  private readonly logger = new Logger(PaymentProviderRegistry.name);
  private readonly providerCache = new Map<string, PaymentProvider>();
  private readonly cacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly prisma: PrismaService) {}

  /// Get payment provider for an organization.
  /// Returns org-level provider if exists, otherwise system-level fallback.
  /// Returns null if no provider configured.
  /// Cached per organization with 5-minute TTL.
  async getProvider(organizationId: string): Promise<PaymentProvider | null> {
    const cacheKey = `org:${organizationId}`;

    // Check cache
    const cached = this.providerCache.get(cacheKey);
    const expiry = this.cacheExpiry.get(cacheKey);

    if (cached && expiry && Date.now() < expiry) {
      return cached;
    }

    // Load org-level provider
    const dbProvider = await this.prisma.paymentProviderConfig.findFirst({
      where: {
        organizationId,
        isActive: true,
        isPrimary: true,
      },
    });

    if (dbProvider) {
      const provider = this.createProvider(dbProvider);
      this.providerCache.set(cacheKey, provider);
      this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL_MS);
      return provider;
    }

    // Fallback to system-level provider
    const systemProvider = await this.prisma.paymentProviderConfig.findFirst({
      where: {
        organizationId: null,
        isActive: true,
        isPrimary: true,
      },
    });

    if (!systemProvider) {
      this.logger.warn(`No payment provider configured for org ${organizationId} or system-wide`);
      return null;
    }

    const provider = this.createProvider(systemProvider);
    this.providerCache.set(cacheKey, provider);
    this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL_MS);
    return provider;
  }

  /// Create provider instance from DB config.
  /// Decrypts credentials and instantiates provider class.
  private createProvider(dbProvider: any): PaymentProvider {
    const config = this.decryptConfig(dbProvider.config);

    switch (dbProvider.providerType) {
      case PaymentProviderType.STRIPE:
        return new StripePaymentProvider({
          providerType: "STRIPE",
          secretKey: config.secretKey,
        });

      case PaymentProviderType.CLICK:
        return new ClickPaymentProvider({
          providerType: "CLICK",
          merchantId: config.merchantId,
          serviceId: config.serviceId,
          secretKey: config.secretKey,
          merchantUserId: config.merchantUserId,
        });

      case PaymentProviderType.PAYME:
        return new PaymePaymentProvider({
          providerType: "PAYME",
          merchantId: config.merchantId,
          secretKey: config.secretKey,
        });

      default:
        throw new Error(`Unsupported payment provider type: ${dbProvider.providerType}`);
    }
  }

  /// Decrypt provider credentials using APP_SECRET.
  /// Format: iv:encrypted (both hex-encoded)
  /// Algorithm: AES-256-CBC
  /// Same pattern as EmailProviderRegistry.
  private decryptConfig(encryptedConfig: string): any {
    const secret = process.env.APP_SECRET;
    if (!secret) {
      throw new Error("APP_SECRET not configured - cannot decrypt payment provider credentials");
    }

    try {
      const [ivHex, encryptedHex] = encryptedConfig.split(":");
      if (!ivHex || !encryptedHex) {
        throw new Error("Invalid encrypted config format - expected 'iv:encrypted'");
      }

      const iv = Buffer.from(ivHex, "hex");
      const encrypted = Buffer.from(encryptedHex, "hex");

      // Use first 32 chars of APP_SECRET as key, padded if shorter
      const key = Buffer.from(secret.substring(0, 32).padEnd(32, "0"));

      const decipher = createDecipheriv("aes-256-cbc", key, iv);
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return JSON.parse(decrypted.toString());
    } catch (error) {
      this.logger.error("Failed to decrypt payment provider config:", error);
      throw new Error("Failed to decrypt payment provider credentials");
    }
  }

  /// Clear cache for an organization.
  /// Called when provider config changes.
  clearCache(organizationId?: string): void {
    if (organizationId) {
      this.providerCache.delete(`org:${organizationId}`);
      this.cacheExpiry.delete(`org:${organizationId}`);
    } else {
      // Clear all caches
      this.providerCache.clear();
      this.cacheExpiry.clear();
    }
  }

  /// Get all configured providers for an organization.
  /// Returns both org-level and system-level providers.
  async listProviders(organizationId: string): Promise<PaymentProviderType[]> {
    const providers = await this.prisma.paymentProviderConfig.findMany({
      where: {
        OR: [{ organizationId }, { organizationId: null }],
        isActive: true,
      },
      select: { providerType: true },
    });

    return providers.map((p) => p.providerType);
  }
}
