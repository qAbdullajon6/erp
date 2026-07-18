import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { NotificationDispatcherService } from '../../notifications/dispatcher/notification-dispatcher.service';
import type { ExecutionContext } from '../engine/workflow-engine.service';

const BLOCKED_IP_RANGES = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^169\.254\./, /^0\./, /^::1$/, /^fc00:/, /^fe80:/,
  /^localhost$/i,
];

const ALLOWED_UPDATE_FIELDS: Record<string, string[]> = {
  order: ['notes', 'deliveryNotes', 'cargoDescription'],
  customer: ['notes', 'contactName', 'contactEmail', 'contactPhone'],
  dispatch: ['notes', 'deliveryNotes'],
};

@Injectable()
export class ActionExecutor {
  private readonly logger = new Logger(ActionExecutor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notificationDispatcher: NotificationDispatcherService,
  ) {}

  private validateWebhookUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid webhook URL');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Blocked protocol: ${parsed.protocol}`);
    }

    const hostname = parsed.hostname;
    if (BLOCKED_IP_RANGES.some(re => re.test(hostname))) {
      throw new Error('Webhook URL targets a blocked internal address');
    }
  }

  async execute(
    actionType: string,
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    switch (actionType) {
      case 'send_email':
        return this.executeSendEmail(config, context);
      case 'send_notification':
        return this.executeSendNotification(config, context);
      case 'dispatch_notification':
        return this.executeDispatchNotification(config, context);
      case 'webhook':
        return this.executeWebhook(config, context);
      case 'change_status':
        return this.executeChangeStatus(config, context);
      case 'assign_driver':
        return this.executeAssignDriver(config, context);
      case 'create_invoice':
        return this.executeCreateInvoice(config, context);
      case 'update_entity':
        return this.executeUpdateEntity(config, context);
      case 'create_entity':
        return this.executeCreateEntity(config, context);
      case 'flag_for_review':
        return this.executeFlagForReview(config, context);
      case 'set_variable':
        return this.executeSetVariable(config, context);
      case 'log':
        return this.executeLog(config, context);
      case 'generate_report':
        return this.executeGenerateReport(config, context);
      case 'send_sms':
        return this.executeSendSms(config, context);
      case 'delete_entity':
        return this.executeDeleteEntity(config, context);
      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }
  }

  private async executeSendEmail(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const to = this.interpolate(String(config.to ?? ''), context);
    const subject = this.interpolate(String(config.subject ?? ''), context);
    const body = this.interpolate(String(config.body ?? config.message ?? ''), context);

    if (!to) throw new Error('Email recipient (to) is required');

    await this.mail.sendRawEmail({ to, subject, textBody: body });

    return { sent: true, to, subject };
  }

  private async executeSendNotification(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const title = this.interpolate(String(config.title ?? 'Workflow Notification'), context);
    const message = this.interpolate(String(config.message ?? ''), context);
    const category = String(config.category ?? 'OPERATIONS');
    const severity = String(config.severity ?? 'MEDIUM');

    const notification = await this.prisma.notification.create({
      data: {
        organizationId: context.organizationId,
        type: 'workflow',
        category: category as any,
        severity: severity as any,
        title,
        message,
        metadata: {
          workflowId: context.workflowId,
          executionId: context.executionId,
        },
      },
    });

    return { notificationId: notification.id, title, dispatched: false };
  }

  private async executeDispatchNotification(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const title = this.interpolate(String(config.title ?? 'Workflow Notification'), context);
    const message = this.interpolate(String(config.message ?? ''), context);
    const category = String(config.category ?? 'OPERATIONS');
    const severity = String(config.severity ?? 'MEDIUM');
    const entityType = config.entityType ? String(config.entityType) : undefined;
    const entityId = config.entityId ? this.interpolate(String(config.entityId), context) : undefined;

    const notification = await this.prisma.notification.create({
      data: {
        organizationId: context.organizationId,
        type: 'workflow',
        category: category as any,
        severity: severity as any,
        title,
        message,
        entityType,
        entityId,
        metadata: {
          workflowId: context.workflowId,
          executionId: context.executionId,
        },
      },
    });

    await this.notificationDispatcher.dispatch({
      organizationId: context.organizationId,
      notificationId: notification.id,
      type: 'workflow',
      category: category as any,
      title,
      message,
      entityType,
      entityId,
      metadata: {
        workflowId: context.workflowId,
        executionId: context.executionId,
      },
    });

    return { notificationId: notification.id, title, dispatched: true };
  }

  private async executeWebhook(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const url = this.interpolate(String(config.url ?? ''), context);
    if (!url) throw new Error('Webhook URL is required');
    this.validateWebhookUrl(url);

    const method = String(config.method ?? 'POST').toUpperCase();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'FlowERP-Workflow/1.0',
    };

    if (config.headers && typeof config.headers === 'object') {
      Object.assign(headers, config.headers);
    }

    const payload = config.payload ?? context.eventPayload;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: method !== 'GET' ? JSON.stringify(payload) : undefined,
        signal: controller.signal,
      });

      const status = response.status;
      let responseBody: unknown = null;
      try {
        responseBody = await response.text();
      } catch {}

      if (status >= 400) {
        throw new Error(`Webhook returned HTTP ${status}`);
      }

      return { status, url, success: true };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async executeChangeStatus(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const entityType = String(config.entityType ?? '').toLowerCase();
    const entityId = this.interpolate(String(config.entityId ?? ''), context) ||
      (context.eventPayload.id as string);
    const newStatus = String(config.status ?? config.newStatus ?? '');

    if (!entityId) throw new Error('Entity ID is required for change_status');
    if (!newStatus) throw new Error('New status is required');

    switch (entityType) {
      case 'order': {
        const result = await this.prisma.order.updateMany({
          where: { id: entityId, organizationId: context.organizationId },
          data: { status: newStatus as any },
        });
        if (result.count === 0) throw new Error(`Order ${entityId} not found in this organization`);
        break;
      }
      case 'dispatch': {
        const result = await this.prisma.dispatch.updateMany({
          where: { id: entityId, organizationId: context.organizationId },
          data: { status: newStatus as any },
        });
        if (result.count === 0) throw new Error(`Dispatch ${entityId} not found in this organization`);
        break;
      }
      case 'invoice': {
        const result = await this.prisma.invoice.updateMany({
          where: { id: entityId, organizationId: context.organizationId },
          data: { status: newStatus as any },
        });
        if (result.count === 0) throw new Error(`Invoice ${entityId} not found in this organization`);
        break;
      }
      case 'customer': {
        const result = await this.prisma.customer.updateMany({
          where: { id: entityId, organizationId: context.organizationId },
          data: { status: newStatus as any },
        });
        if (result.count === 0) throw new Error(`Customer ${entityId} not found in this organization`);
        break;
      }
      default:
        throw new Error(`Unsupported entity type for status change: ${entityType}`);
    }

    return { entityType, entityId, newStatus };
  }

  private async executeAssignDriver(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const driverId = this.interpolate(String(config.driverId ?? ''), context);
    const dispatchId = this.interpolate(String(config.dispatchId ?? ''), context) ||
      (context.eventPayload.id as string) ||
      (context.eventPayload.dispatchId as string);

    if (!dispatchId) throw new Error('Dispatch ID is required for assign_driver');

    if (driverId) {
      const result = await this.prisma.dispatch.updateMany({
        where: { id: dispatchId, organizationId: context.organizationId },
        data: { driverId },
      });
      if (result.count === 0) throw new Error(`Dispatch ${dispatchId} not found in this organization`);
      return { dispatchId, driverId, method: 'explicit' };
    }

    return { dispatchId, driverId: null, method: 'skipped_no_driver' };
  }

  private async executeCreateInvoice(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const orderId = this.interpolate(String(config.orderId ?? ''), context) ||
      (context.eventPayload.orderId as string) ||
      (context.eventPayload.id as string);

    if (!orderId) throw new Error('Order ID is required for create_invoice');

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, organizationId: context.organizationId },
    });
    if (!order) throw new Error(`Order ${orderId} not found`);

    const invoice = await this.prisma.invoice.create({
      data: {
        organizationId: context.organizationId,
        customerId: order.customerId,
        orderId: order.id,
        invoiceNumber: `INV-WF-${Date.now()}`,
        status: 'DRAFT',
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 86_400_000),
        subtotal: order.price,
        taxAmount: 0,
        totalAmount: order.price,
        balanceDue: order.price,
      },
    });

    return { invoiceId: invoice.id, orderId, total: order.price.toString() };
  }

  private async executeUpdateEntity(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const entityType = String(config.entityType ?? '').toLowerCase();
    const entityId = this.interpolate(String(config.entityId ?? ''), context) ||
      (context.eventPayload.id as string);
    const rawFields = (config.fields ?? config.data ?? {}) as Record<string, unknown>;

    if (!entityId) throw new Error('Entity ID is required');
    if (!entityType) throw new Error('Entity type is required');

    const allowed = ALLOWED_UPDATE_FIELDS[entityType];
    if (!allowed) throw new Error(`Unsupported entity type: ${entityType}`);

    const fields: Record<string, unknown> = {};
    for (const key of Object.keys(rawFields)) {
      if (allowed.includes(key)) {
        fields[key] = rawFields[key];
      }
    }
    if (Object.keys(fields).length === 0) {
      throw new Error(`No allowed fields to update. Allowed: ${allowed.join(', ')}`);
    }

    switch (entityType) {
      case 'order': {
        const result = await this.prisma.order.updateMany({
          where: { id: entityId, organizationId: context.organizationId },
          data: fields as any,
        });
        if (result.count === 0) throw new Error(`Order ${entityId} not found in this organization`);
        break;
      }
      case 'customer': {
        const result = await this.prisma.customer.updateMany({
          where: { id: entityId, organizationId: context.organizationId },
          data: fields as any,
        });
        if (result.count === 0) throw new Error(`Customer ${entityId} not found in this organization`);
        break;
      }
      case 'dispatch': {
        const result = await this.prisma.dispatch.updateMany({
          where: { id: entityId, organizationId: context.organizationId },
          data: fields as any,
        });
        if (result.count === 0) throw new Error(`Dispatch ${entityId} not found in this organization`);
        break;
      }
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }

    return { entityType, entityId, updated: true };
  }

  private async executeCreateEntity(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const entityType = String(config.entityType ?? '').toLowerCase();
    const fields = (config.fields ?? config.data ?? {}) as Record<string, unknown>;

    if (!entityType) throw new Error('Entity type is required');

    switch (entityType) {
      case 'notification': {
        const n = await this.prisma.notification.create({
          data: {
            organizationId: context.organizationId,
            type: String(fields.type ?? 'workflow'),
            category: 'OPERATIONS',
            severity: 'MEDIUM',
            title: String(fields.title ?? 'Workflow Created'),
            message: String(fields.message ?? ''),
            metadata: fields.metadata as any ?? undefined,
          },
        });
        return { entityType, entityId: n.id };
      }
      default:
        throw new Error(`Entity creation not supported for: ${entityType}`);
    }
  }

  private async executeFlagForReview(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const reason = this.interpolate(String(config.reason ?? 'Flagged by workflow'), context);
    const entityId = (context.eventPayload.id as string) ?? 'unknown';

    await this.prisma.notification.create({
      data: {
        organizationId: context.organizationId,
        type: 'workflow_review',
        category: 'OPERATIONS',
        severity: 'HIGH',
        title: 'Item Flagged for Review',
        message: reason,
        metadata: {
          workflowId: context.workflowId,
          executionId: context.executionId,
          entityId,
          reason,
        },
      },
    });

    return { flagged: true, reason, entityId };
  }

  private executeSetVariable(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Record<string, unknown> {
    const name = String(config.name ?? '');
    const value = config.value;
    if (name) {
      context.variables[name] = value;
    }
    return { variable: name, value };
  }

  private executeLog(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Record<string, unknown> {
    const message = this.interpolate(String(config.message ?? ''), context);
    this.logger.log(`[Workflow ${context.workflowId}] ${message}`);
    return { logged: true, message };
  }

  private async executeGenerateReport(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const reportType = String(config.reportType ?? 'summary');
    return { reportType, generated: true, note: 'Report generation placeholder' };
  }

  private async executeSendSms(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const to = this.interpolate(String(config.to ?? ''), context);
    const message = this.interpolate(String(config.message ?? ''), context);
    if (!to) throw new Error('SMS recipient (to) is required');
    return { sent: true, to, message, note: 'SMS delivery requires external provider configuration' };
  }

  private async executeDeleteEntity(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const entityType = String(config.entityType ?? '').toLowerCase();
    const entityId = this.interpolate(String(config.entityId ?? ''), context) ||
      (context.eventPayload.id as string);

    if (!entityId || !entityType) throw new Error('Entity type and ID required');

    switch (entityType) {
      case 'notification': {
        const result = await this.prisma.notification.deleteMany({
          where: { id: entityId, organizationId: context.organizationId },
        });
        if (result.count === 0) throw new Error(`Notification ${entityId} not found in this organization`);
        break;
      }
      default:
        throw new Error(`Deletion not supported for: ${entityType} (safety restriction)`);
    }

    return { entityType, entityId, deleted: true };
  }

  private interpolate(template: string, context: ExecutionContext): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
      const trimmed = path.trim();
      const value = this.resolve(trimmed, context);
      return value !== undefined ? String(value) : '';
    });
  }

  private resolve(path: string, context: ExecutionContext): unknown {
    if (path.startsWith('payload.')) {
      return this.deepGet(context.eventPayload, path.slice(8));
    }
    if (path.startsWith('variables.')) {
      return this.deepGet(context.variables, path.slice(10));
    }
    if (path.startsWith('step.')) {
      const [, indexStr, ...rest] = path.split('.');
      const idx = parseInt(indexStr, 10);
      const stepResult = context.stepResults[idx];
      if (!stepResult || !rest.length) return stepResult;
      return this.deepGet(stepResult as Record<string, unknown>, rest.join('.'));
    }
    return this.deepGet(context.eventPayload, path);
  }

  private deepGet(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return current;
  }
}
