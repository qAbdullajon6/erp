import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationChannel } from '@prisma/client';
import * as DOMPurify from 'isomorphic-dompurify';

export interface RenderTemplateRequest {
  organizationId: string;
  templateKey: string;
  channel: NotificationChannel;
  variables: Record<string, any>;
  locale?: string;
}

export interface RenderTemplateResult {
  subject?: string;
  bodyHtml?: string;
  bodyText: string;
  templateId: string;
}

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);
  private templateCache = new Map<string, any>();

  constructor(private prisma: PrismaService) {}

  async render(request: RenderTemplateRequest): Promise<RenderTemplateResult | null> {
    const template = await this.getTemplate(
      request.organizationId,
      request.templateKey,
      request.channel,
      request.locale || 'en',
    );

    if (!template) {
      this.logger.warn(
        `No template found for key=${request.templateKey}, channel=${request.channel}, org=${request.organizationId}`,
      );
      return null;
    }

    this.validateVariables(template.variables as string[], request.variables);

    const subject = template.subject
      ? this.interpolate(template.subject, request.variables)
      : undefined;

    const bodyHtml = template.bodyHtml
      ? this.interpolate(template.bodyHtml, request.variables)
      : undefined;

    const bodyText = this.interpolate(template.bodyText, request.variables);

    return {
      subject,
      bodyHtml: bodyHtml ? this.sanitizeHtml(bodyHtml) : undefined,
      bodyText,
      templateId: template.id,
    };
  }

  async getTemplate(
    organizationId: string,
    key: string,
    channel: NotificationChannel,
    locale: string,
  ) {
    const cacheKey = `${organizationId}:${key}:${channel}:${locale}`;
    if (this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey);
    }

    let template = await this.prisma.notificationTemplate.findUnique({
      where: {
        organizationId_key_channel_locale: {
          organizationId,
          key,
          channel,
          locale,
        },
        isActive: true,
      },
    });

    if (!template) {
      template = await this.prisma.notificationTemplate.findUnique({
        where: {
          organizationId_key_channel_locale: {
            organizationId: null as any,
            key,
            channel,
            locale,
          },
          isActive: true,
        },
      });
    }

    if (template) {
      this.templateCache.set(cacheKey, template);
    }

    return template;
  }

  async createVersion(templateId: string, createdBy?: string) {
    const template = await this.prisma.notificationTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new Error('Template not found');
    }

    await this.prisma.notificationTemplateVersion.create({
      data: {
        templateId,
        version: template.version,
        subject: template.subject,
        bodyHtml: template.bodyHtml,
        bodyText: template.bodyText,
        variables: template.variables as any,
        createdBy,
      },
    });

    await this.prisma.notificationTemplate.update({
      where: { id: templateId },
      data: { version: { increment: 1 } },
    });

    this.clearTemplateCache(template.organizationId ?? undefined, template.key);
  }

  private interpolate(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      if (key in variables) {
        return String(variables[key]);
      }
      return match;
    });
  }

  private validateVariables(expected: string[], provided: Record<string, any>) {
    const missing = expected.filter((key) => !(key in provided));
    if (missing.length > 0) {
      this.logger.warn(`Missing template variables: ${missing.join(', ')}`);
    }
  }

  private sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p',
        'br',
        'strong',
        'em',
        'b',
        'i',
        'u',
        'a',
        'ul',
        'ol',
        'li',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'div',
        'span',
        'table',
        'tr',
        'td',
        'th',
        'thead',
        'tbody',
      ],
      ALLOWED_ATTR: ['href', 'target', 'style', 'class'],
    });
  }

  clearTemplateCache(organizationId?: string, key?: string) {
    if (organizationId && key) {
      const prefix = `${organizationId}:${key}:`;
      for (const cacheKey of this.templateCache.keys()) {
        if (cacheKey.startsWith(prefix)) {
          this.templateCache.delete(cacheKey);
        }
      }
    } else {
      this.templateCache.clear();
    }
  }
}
