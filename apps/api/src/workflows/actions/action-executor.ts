import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type {
  CustomerStatus,
  DispatchStatus,
  MembershipRole,
  NotificationCategory,
  NotificationSeverity,
  OrderStatus,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { CurrentUserPayload } from '../../auth/interfaces/current-user.interface';
// Type-only: importing these as VALUES here creates an ES-module cycle
// (orders.service -> workflow-event.service -> ... ) that leaves OrdersService's
// own injected deps undefined at metadata time. The runtime class tokens are
// pulled lazily inside the resolver methods below via dynamic import.
import type { DispatchesService } from '../../dispatch/dispatches.service';
import type { InvoicesService } from '../../invoices/invoices.service';
import type { OrdersService } from '../../orders/orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { NotificationDispatcherService } from '../../notifications/dispatcher/notification-dispatcher.service';
import type { ExecutionContext } from '../engine/workflow-engine.service';

const BLOCKED_IP_RANGES = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^169\.254\./, /^0\./, /^::1$/, /^fc00:/, /^fe80:/,
  /^localhost$/i,
];

// Field names here must match real Prisma columns exactly — this is a plain
// string allowlist with no compile-time link to the schema, so a typo (or a
// schema rename) silently produces a Prisma "Unknown argument" failure at
// execution time instead of a build error. `customer` previously listed
// 'notes' / 'contactEmail' / 'contactPhone', none of which are real columns
// (they are 'internalNotes'/'deliveryNotes', 'email', 'phone') — every
// update_entity on a customer failed for those fields, always, not just for
// archived ones.
const ALLOWED_UPDATE_FIELDS: Record<string, string[]> = {
  order: ['notes', 'deliveryNotes', 'cargoDescription'],
  customer: ['contactName', 'email', 'phone', 'deliveryNotes', 'internalNotes'],
  dispatch: ['notes'],
};

function configString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return fallback;
}

const NOTIFICATION_CATEGORIES: NotificationCategory[] = ['OPERATIONS', 'FINANCE', 'CUSTOMERS', 'FLEET', 'BILLING'];
const NOTIFICATION_SEVERITIES: NotificationSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/// Without this, an invalid category/severity in a notify action's config
/// wasn't caught until the Prisma insert, surfacing a raw
/// PrismaClientValidationError (query + stack trace) as the execution's error
/// instead of a message a workflow author can act on.
function validatedEnum<T extends string>(value: string, allowed: T[], field: string): T {
  if (!allowed.includes(value as T)) {
    throw new Error(`Invalid ${field} "${value}". Must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

@Injectable()
export class ActionExecutor {
  private readonly logger = new Logger(ActionExecutor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notificationDispatcher: NotificationDispatcherService,
    /// Lazy-resolved to avoid a circular Nest module graph:
    /// OrdersModule/DispatchModule both import WorkflowsModule.
    private readonly moduleRef: ModuleRef,
  ) {}

  /// System actor for workflow-driven domain writes. History/audit columns
  /// accept a null actor (schema: changedByUserId / actorUserId nullable for
  /// system-initiated changes). Prefer a real org ADMIN when one exists so
  /// audit trails name a person instead of "unknown".
  private async workflowActor(organizationId: string): Promise<CurrentUserPayload> {
    const membership = await this.prisma.membership.findFirst({
      where: { organizationId, role: 'ADMIN', status: 'ACTIVE' },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'asc' },
    }) ?? await this.prisma.membership.findFirst({
      where: { organizationId, status: 'ACTIVE' },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'asc' },
    });

    if (!membership) {
      return {
        userId: null as unknown as string,
        membershipId: '',
        organizationId,
        role: 'ADMIN' as MembershipRole,
        email: 'workflow@system',
        isPlatformAdmin: false,
      };
    }

    return {
      userId: membership.userId,
      membershipId: membership.id,
      organizationId,
      role: membership.role,
      email: membership.user.email,
      isPlatformAdmin: false,
    };
  }

  private async ordersService(): Promise<OrdersService> {
    const { OrdersService } = await import('../../orders/orders.service');
    return this.moduleRef.get(OrdersService, { strict: false });
  }

  private async dispatchesService(): Promise<DispatchesService> {
    const { DispatchesService } = await import('../../dispatch/dispatches.service');
    return this.moduleRef.get(DispatchesService, { strict: false });
  }

  private async invoicesService(): Promise<InvoicesService> {
    const { InvoicesService } = await import('../../invoices/invoices.service');
    return this.moduleRef.get(InvoicesService, { strict: false });
  }

  private rethrowDomain(error: unknown): never {
    if (error instanceof HttpException) {
      const body = error.getResponse();
      let message: string;
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null && 'message' in body) {
        const msg = (body as Record<string, unknown>).message;
        message = Array.isArray(msg)
          ? msg.map((item) => configString(item)).join(', ')
          : configString(msg, error.message);
      } else {
        message = error.message;
      }
      throw new Error(message);
    }
    throw error;
  }

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
    const to = this.interpolate(configString(config.to), context);
    const subject = this.interpolate(configString(config.subject), context);
    const body = this.interpolate(configString(config.body ?? config.message), context);

    if (!to) throw new Error('Email recipient (to) is required');

    await this.mail.sendRawEmail({ to, subject, textBody: body });

    return { sent: true, to, subject };
  }

  private async executeSendNotification(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const title = this.interpolate(configString(config.title, 'Workflow Notification'), context);
    const message = this.interpolate(configString(config.message), context);
    const category = validatedEnum(configString(config.category, 'OPERATIONS'), NOTIFICATION_CATEGORIES, 'category');
    const severity = validatedEnum(configString(config.severity, 'MEDIUM'), NOTIFICATION_SEVERITIES, 'severity');

    const notification = await this.prisma.notification.create({
      data: {
        organizationId: context.organizationId,
        type: 'workflow',
        category,
        severity,
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
    const title = this.interpolate(configString(config.title, 'Workflow Notification'), context);
    const message = this.interpolate(configString(config.message), context);
    const category = validatedEnum(configString(config.category, 'OPERATIONS'), NOTIFICATION_CATEGORIES, 'category');
    const severity = validatedEnum(configString(config.severity, 'MEDIUM'), NOTIFICATION_SEVERITIES, 'severity');
    const entityType = config.entityType ? configString(config.entityType) : undefined;
    const entityId = config.entityId ? this.interpolate(configString(config.entityId), context) : undefined;

    const notification = await this.prisma.notification.create({
      data: {
        organizationId: context.organizationId,
        type: 'workflow',
        category,
        severity,
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
      category,
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
    const url = this.interpolate(configString(config.url), context);
    if (!url) throw new Error('Webhook URL is required');
    this.validateWebhookUrl(url);

    const method = configString(config.method, 'POST').toUpperCase();
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
      await response.text().catch(() => undefined);

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
    const entityType = configString(config.entityType).toLowerCase();
    const entityId = this.interpolate(configString(config.entityId), context) ||
      (context.eventPayload.id as string);
    const newStatus = configString(config.status ?? config.newStatus);
    const note = config.note
      ? this.interpolate(configString(config.note), context)
      : `Workflow ${context.workflowId}`;

    if (!entityId) throw new Error('Entity ID is required for change_status');
    if (!newStatus) throw new Error('New status is required');

    const actor = await this.workflowActor(context.organizationId);

    try {
      switch (entityType) {
        case 'order': {
          // ADR-001: order status is a projection of dispatch. Route through
          // OrdersService so TransitionPolicy, OrderWriter, history, and
          // dispatch advancement all run — never raw prisma.order.updateMany.
          const orders = await this.ordersService();
          if (newStatus === 'CANCELLED') {
            await orders.cancel(context.organizationId, entityId, { note }, actor);
          } else {
            await orders.updateStatus(
              context.organizationId,
              entityId,
              { status: newStatus as OrderStatus, note },
              actor,
            );
          }
          break;
        }
        case 'dispatch': {
          const dispatches = await this.dispatchesService();
          if (newStatus === 'CANCELLED') {
            await dispatches.cancel(context.organizationId, entityId, actor);
          } else {
            await dispatches.updateStatus(
              context.organizationId,
              entityId,
              { status: newStatus as DispatchStatus, note },
              actor,
            );
          }
          break;
        }
        case 'invoice': {
          // Never raw-update invoice status — that bypasses send/cancel/payment
          // rules and ACCOUNTANT finalization. Route through InvoicesService.
          const invoices = await this.invoicesService();
          const normalized = newStatus.toUpperCase();
          if (normalized === 'SENT' || normalized === 'SEND') {
            await invoices.send(context.organizationId, entityId, actor);
          } else if (normalized === 'CANCELLED' || normalized === 'CANCEL') {
            await invoices.cancel(context.organizationId, entityId, actor);
          } else {
            throw new Error(
              `Workflow change_status for invoices only supports SENT or CANCELLED (got ${newStatus})`,
            );
          }
          break;
        }
        case 'customer': {
          const result = await this.prisma.customer.updateMany({
            where: { id: entityId, organizationId: context.organizationId, archivedAt: null },
            data: { status: newStatus as CustomerStatus },
          });
          if (result.count === 0) throw new Error(`Customer ${entityId} not found, or is archived, in this organization`);
          break;
        }
        default:
          throw new Error(`Unsupported entity type for status change: ${entityType}`);
      }
    } catch (error) {
      this.rethrowDomain(error);
    }

    return { entityType, entityId, newStatus };
  }

  private async executeAssignDriver(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const driverId = this.interpolate(configString(config.driverId), context);
    const vehicleId = this.interpolate(configString(config.vehicleId), context);
    const dispatchId = this.interpolate(configString(config.dispatchId), context) ||
      (context.eventPayload.id as string) ||
      (context.eventPayload.dispatchId as string);
    const orderId = this.interpolate(configString(config.orderId), context) ||
      (context.eventPayload.orderId as string);

    if (!driverId) {
      return { dispatchId: dispatchId || null, driverId: null, method: 'skipped_no_driver' };
    }

    const actor = await this.workflowActor(context.organizationId);

    try {
      // Prefer order-level assign when we have both resources — that path
      // creates/activates the dispatch under ADR-001. Dispatch-only reassign
      // when the trip already exists and we only have a driver (vehicle kept).
      if (orderId && vehicleId) {
        const orders = await this.ordersService();
        await orders.assign(
          context.organizationId,
          orderId,
          { driverId, vehicleId },
          actor,
        );
        return { orderId, driverId, vehicleId, method: 'order_assign' };
      }

      if (!dispatchId) {
        throw new Error('Dispatch ID (or orderId + vehicleId) is required for assign_driver');
      }

      const dispatches = await this.dispatchesService();
      await dispatches.update(
        context.organizationId,
        dispatchId,
        {
          driverId,
          ...(vehicleId ? { vehicleId } : {}),
        },
        actor,
      );
      return { dispatchId, driverId, vehicleId: vehicleId || null, method: 'dispatch_reassign' };
    } catch (error) {
      this.rethrowDomain(error);
    }
  }

  private async executeCreateInvoice(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const orderId = this.interpolate(configString(config.orderId), context) ||
      (context.eventPayload.orderId as string) ||
      (context.eventPayload.id as string);

    if (!orderId) throw new Error('Order ID is required for create_invoice');

    const actor = await this.workflowActor(context.organizationId);
    try {
      const invoices = await this.invoicesService();
      const invoice = await invoices.createFromOrder(context.organizationId, orderId, actor);
      return {
        invoiceId: invoice.id,
        orderId,
        total: invoice.totalAmount,
        method: 'invoices_create_from_order',
      };
    } catch (error) {
      this.rethrowDomain(error);
    }
  }

  private async executeUpdateEntity(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const entityType = configString(config.entityType).toLowerCase();
    const entityId = this.interpolate(configString(config.entityId), context) ||
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
          where: { id: entityId, organizationId: context.organizationId, archivedAt: null },
          data: fields,
        });
        if (result.count === 0) throw new Error(`Order ${entityId} not found, or is archived, in this organization`);
        break;
      }
      case 'customer': {
        const result = await this.prisma.customer.updateMany({
          where: { id: entityId, organizationId: context.organizationId, archivedAt: null },
          data: fields,
        });
        if (result.count === 0) throw new Error(`Customer ${entityId} not found, or is archived, in this organization`);
        break;
      }
      case 'dispatch': {
        const result = await this.prisma.dispatch.updateMany({
          where: { id: entityId, organizationId: context.organizationId },
          data: fields,
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
    const entityType = configString(config.entityType).toLowerCase();
    const fields = (config.fields ?? config.data ?? {}) as Record<string, unknown>;

    if (!entityType) throw new Error('Entity type is required');

    switch (entityType) {
      case 'notification': {
        const n = await this.prisma.notification.create({
          data: {
            organizationId: context.organizationId,
            type: configString(fields.type, 'workflow'),
            category: 'OPERATIONS',
            severity: 'MEDIUM',
            title: configString(fields.title, 'Workflow Created'),
            message: configString(fields.message),
            metadata: fields.metadata === undefined
              ? undefined
              : (fields.metadata as Prisma.InputJsonValue),
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
    const reason = this.interpolate(configString(config.reason, 'Flagged by workflow'), context);
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
    const name = configString(config.name);
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
    const message = this.interpolate(configString(config.message), context);
    this.logger.log(`[Workflow ${context.workflowId}] ${message}`);
    return { logged: true, message };
  }

  private executeGenerateReport(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const reportType = configString(config.reportType, 'summary');
    this.logger.warn(
      `[Workflow ${context.workflowId}] generate_report is a placeholder (type=${reportType})`,
    );
    return Promise.resolve({
      reportType,
      generated: false,
      note: 'Report generation via workflow is not implemented; action recorded but no report was produced',
    });
  }

  private executeSendSms(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const to = this.interpolate(configString(config.to), context);
    const message = this.interpolate(configString(config.message), context);
    if (!to) throw new Error('SMS recipient (to) is required');
    // Honest stub: no SMS provider is wired. Claiming `sent: true` made
    // failed customer notifications look successful in execution history.
    this.logger.warn(
      `[Workflow ${context.workflowId}] SMS not delivered — no provider configured (to=${to})`,
    );
    return Promise.resolve({
      sent: false,
      to,
      message,
      note: 'SMS delivery is not configured; action recorded but message was not sent',
    });
  }

  private async executeDeleteEntity(
    config: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const entityType = configString(config.entityType).toLowerCase();
    const entityId = this.interpolate(configString(config.entityId), context) ||
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
      return value !== undefined ? configString(value) : '';
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
