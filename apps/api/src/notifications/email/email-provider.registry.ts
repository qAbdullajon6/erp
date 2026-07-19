import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailProviderType } from '@prisma/client';
import { EmailProvider } from './providers/email-provider.interface';
import { SmtpEmailProvider } from './providers/smtp.provider';
import { ResendEmailProvider } from './providers/resend.provider';
import { SendGridEmailProvider } from './providers/sendgrid.provider';
import { SesEmailProvider } from './providers/ses.provider';
import { createDecipheriv } from 'crypto';

@Injectable()
export class EmailProviderRegistry {
  private providerCache = new Map<string, EmailProvider>();

  constructor(private prisma: PrismaService) {}

  async getProvider(organizationId: string): Promise<EmailProvider | null> {
    const cacheKey = `org:${organizationId}`;
    if (this.providerCache.has(cacheKey)) {
      return this.providerCache.get(cacheKey)!;
    }

    const dbProvider = await this.prisma.emailProvider.findFirst({
      where: {
        organizationId,
        isActive: true,
        isPrimary: true,
      },
    });

    if (!dbProvider) {
      const systemProvider = await this.prisma.emailProvider.findFirst({
        where: {
          organizationId: null,
          isActive: true,
          isPrimary: true,
        },
      });

      if (!systemProvider) {
        return null;
      }

      const provider = this.createProvider(systemProvider);
      this.providerCache.set(cacheKey, provider);
      return provider;
    }

    const provider = this.createProvider(dbProvider);
    this.providerCache.set(cacheKey, provider);
    return provider;
  }

  private createProvider(dbProvider: any): EmailProvider {
    const config = this.decryptConfig(dbProvider.config);
    const baseConfig = {
      fromEmail: dbProvider.fromEmail,
      fromName: dbProvider.fromName,
      replyToEmail: dbProvider.replyToEmail || undefined,
    };

    switch (dbProvider.providerType) {
      case EmailProviderType.SMTP:
        return new SmtpEmailProvider({
          ...baseConfig,
          host: config.host,
          port: config.port,
          secure: config.secure,
          user: config.user,
          password: config.password,
        });

      case EmailProviderType.RESEND:
        return new ResendEmailProvider({
          ...baseConfig,
          apiKey: config.apiKey,
        });

      case EmailProviderType.SENDGRID:
        return new SendGridEmailProvider({
          ...baseConfig,
          apiKey: config.apiKey,
        });

      case EmailProviderType.AWS_SES:
        return new SesEmailProvider({
          ...baseConfig,
          region: config.region,
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        });

      default:
        throw new Error(
          `Unsupported email provider type: ${dbProvider.providerType}`,
        );
    }
  }

  private decryptConfig(encryptedConfig: string): any {
    const secret = process.env.APP_SECRET;
    if (!secret) {
      throw new Error('APP_SECRET not configured');
    }

    const [ivHex, encryptedHex] = encryptedConfig.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const key = Buffer.from(secret.substring(0, 32).padEnd(32, '0'));

    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return JSON.parse(decrypted.toString());
  }

  clearCache(organizationId?: string) {
    if (organizationId) {
      this.providerCache.delete(`org:${organizationId}`);
    } else {
      this.providerCache.clear();
    }
  }
}
