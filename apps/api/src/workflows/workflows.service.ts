import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WorkflowStatus, WorkflowExecutionStatus, Prisma } from '@prisma/client';
import { WorkflowEngineService } from './engine/workflow-engine.service';

export interface AffectedEntity {
  type: string;
  id: string;
}

/// Every ActionExecutor `execute*` method returns a different output shape
/// (see action-executor.ts) — there is no shared "what did this touch"
/// contract between them. Rather than add one (a larger, riskier change to a
/// dozen call sites), this reads the id/type fields each shape already has.
function extractAffectedEntity(output: unknown): AffectedEntity | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);

  const entityType = str(o.entityType);
  const entityId = str(o.entityId);
  if (entityType && entityId) return { type: entityType, id: entityId };

  if (str(o.notificationId)) return { type: 'notification', id: str(o.notificationId)! };
  if (str(o.invoiceId)) return { type: 'invoice', id: str(o.invoiceId)! };
  if (str(o.dispatchId)) return { type: 'dispatch', id: str(o.dispatchId)! };
  if (str(o.orderId)) return { type: 'order', id: str(o.orderId)! };
  return null;
}

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly engine: WorkflowEngineService,
  ) {}

  async list(organizationId: string, query: {
    page?: number;
    limit?: number;
    active?: string;
    status?: WorkflowStatus;
    search?: string;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.WorkflowWhereInput = { organizationId };
    if (query.active === 'true') where.active = true;
    if (query.active === 'false') where.active = false;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.workflow.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.workflow.count({ where }),
    ]);

    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(organizationId: string, id: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id, organizationId },
    });
    if (!workflow) throw new NotFoundException('Workflow not found');
    return workflow;
  }

  async create(organizationId: string, userId: string, input: {
    name: string;
    description?: string;
    config: Record<string, unknown>;
    active?: boolean;
  }) {
    // Always create as inactive DRAFT. Activation goes through toggle → publish
    // so event triggers cannot silently no-op on a DRAFT-with-active=true row.
    const workflow = await this.prisma.workflow.create({
      data: {
        organizationId,
        createdByUserId: userId,
        name: input.name,
        description: input.description ?? null,
        config: input.config as Prisma.InputJsonValue,
        active: false,
        status: 'DRAFT',
      },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'workflow.created',
      entityType: 'Workflow',
      entityId: workflow.id,
      metadata: { name: workflow.name, requestedActive: input.active ?? false },
    });

    return workflow;
  }

  async update(organizationId: string, userId: string, id: string, input: {
    name?: string;
    description?: string;
    config?: Record<string, unknown>;
    active?: boolean;
  }) {
    const workflow = await this.getById(organizationId, id);

    if (workflow.status === 'ARCHIVED') {
      throw new ConflictException('Cannot update an archived workflow');
    }

    // Activating via PATCH must publish a DRAFT the same way toggle does.
    if (input.active === true && workflow.status === 'DRAFT') {
      const published = await this.publish(organizationId, userId, id);
      const needsMetaUpdate =
        input.name !== undefined ||
        input.description !== undefined ||
        input.config !== undefined;
      if (!needsMetaUpdate) return published;
      // Fall through to apply remaining field updates on the now-PUBLISHED row.
    }

    const updated = await this.prisma.workflow.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.config !== undefined && { config: input.config as Prisma.InputJsonValue }),
        ...(input.active !== undefined &&
          !(input.active === true && workflow.status === 'DRAFT') && { active: input.active }),
        updatedSeq: { increment: 1 },
      },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'workflow.updated',
      entityType: 'Workflow',
      entityId: id,
      metadata: input,
    });

    return updated;
  }

  async delete(organizationId: string, userId: string, id: string) {
    const workflow = await this.getById(organizationId, id);

    const runningCount = await this.prisma.workflowExecution.count({
      where: { workflowId: id, status: { in: ['PENDING', 'QUEUED', 'RUNNING'] } },
    });
    if (runningCount > 0) {
      throw new ConflictException('Cannot delete a workflow with active executions');
    }

    await this.prisma.workflow.delete({ where: { id } });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'workflow.deleted',
      entityType: 'Workflow',
      entityId: id,
      metadata: { name: workflow.name },
    });
  }

  async toggle(organizationId: string, userId: string, id: string) {
    const workflow = await this.getById(organizationId, id);

    if (workflow.status === 'ARCHIVED') {
      throw new ConflictException('Cannot toggle an archived workflow');
    }

    // Activating a DRAFT must publish — event triggers only match
    // `active && PUBLISHED`. Without this, the UI "active" switch never
    // made workflows fire on domain events.
    if (!workflow.active && workflow.status === 'DRAFT') {
      return this.publish(organizationId, userId, id);
    }

    const updated = await this.prisma.workflow.update({
      where: { id },
      data: { active: !workflow.active, updatedSeq: { increment: 1 } },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: workflow.active ? 'workflow.deactivated' : 'workflow.activated',
      entityType: 'Workflow',
      entityId: id,
    });

    return updated;
  }

  async publish(organizationId: string, userId: string, id: string) {
    const workflow = await this.getById(organizationId, id);

    if (workflow.status === 'ARCHIVED') {
      throw new ConflictException('Cannot publish an archived workflow');
    }

    const config = workflow.config as Record<string, unknown>;
    this.validateConfig(config);

    const [updated] = await this.prisma.$transaction([
      this.prisma.workflow.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          active: true,
          version: { increment: 1 },
          updatedSeq: { increment: 1 },
        },
      }),
      this.prisma.workflowVersion.create({
        data: {
          workflowId: id,
          organizationId,
          version: workflow.version + 1,
          config: workflow.config as Prisma.InputJsonValue,
          publishedByUserId: userId,
        },
      }),
    ]);

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'workflow.published',
      entityType: 'Workflow',
      entityId: id,
      metadata: { version: updated.version },
    });

    return updated;
  }

  async archive(organizationId: string, userId: string, id: string) {
    await this.getById(organizationId, id);

    const runningCount = await this.prisma.workflowExecution.count({
      where: { workflowId: id, status: { in: ['PENDING', 'QUEUED', 'RUNNING'] } },
    });
    if (runningCount > 0) {
      throw new ConflictException('Cannot archive a workflow with active executions');
    }

    const updated = await this.prisma.workflow.update({
      where: { id },
      data: { status: 'ARCHIVED', active: false, updatedSeq: { increment: 1 } },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'workflow.archived',
      entityType: 'Workflow',
      entityId: id,
    });

    return updated;
  }

  async duplicate(organizationId: string, userId: string, id: string, newName?: string) {
    const workflow = await this.getById(organizationId, id);

    const duplicated = await this.prisma.workflow.create({
      data: {
        organizationId,
        createdByUserId: userId,
        name: newName || `${workflow.name} (copy)`,
        description: workflow.description,
        config: workflow.config as Prisma.InputJsonValue,
        active: false,
        status: 'DRAFT',
      },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'workflow.duplicated',
      entityType: 'Workflow',
      entityId: duplicated.id,
      metadata: { sourceId: id },
    });

    return duplicated;
  }

  async exportWorkflow(organizationId: string, id: string) {
    const workflow = await this.getById(organizationId, id);
    return {
      name: workflow.name,
      description: workflow.description,
      config: workflow.config,
      version: workflow.version,
      exportedAt: new Date().toISOString(),
    };
  }

  async importWorkflow(organizationId: string, userId: string, data: {
    name: string;
    description?: string;
    config: Record<string, unknown>;
  }) {
    this.validateConfig(data.config);

    const workflow = await this.prisma.workflow.create({
      data: {
        organizationId,
        createdByUserId: userId,
        name: data.name,
        description: data.description ?? null,
        config: data.config as Prisma.InputJsonValue,
        active: false,
        status: 'DRAFT',
      },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'workflow.imported',
      entityType: 'Workflow',
      entityId: workflow.id,
      metadata: { name: workflow.name },
    });

    return workflow;
  }

  async getExecutions(organizationId: string, workflowId: string, query: {
    page?: number;
    limit?: number;
    status?: WorkflowExecutionStatus;
  }) {
    await this.getById(organizationId, workflowId);

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.WorkflowExecutionWhereInput = { workflowId, organizationId };
    if (query.status) where.status = query.status;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.workflowExecution.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
        include: {
          logs: { orderBy: { createdAt: 'asc' }, take: 50 },
          // Same list-page-sized cost as `logs` above — needed so callers
          // (including the AI's get_workflow_runs tool) can say WHICH
          // invoice/notification/etc. a past run actually touched, not just
          // that it succeeded. Without this the model could see a COMPLETED
          // "create invoice" run but had no way to name the invoice it made.
          steps: { orderBy: { stepIndex: 'asc' }, select: { output: true } },
        },
      }),
      this.prisma.workflowExecution.count({ where }),
    ]);

    return {
      items: items.map(({ steps, ...execution }) => ({
        ...execution,
        durationMs: execution.completedAt
          ? execution.completedAt.getTime() - execution.startedAt.getTime()
          : null,
        affectedEntities: steps
          .map((step) => extractAffectedEntity(step.output))
          .filter((entity): entity is AffectedEntity => entity !== null),
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getExecution(organizationId: string, executionId: string) {
    const execution = await this.prisma.workflowExecution.findFirst({
      where: { id: executionId, organizationId },
      include: {
        steps: { orderBy: { stepIndex: 'asc' } },
        logs: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!execution) throw new NotFoundException('Execution not found');

    // WorkflowExecution itself carries no actor column — manual/retry runs are
    // attributed on the AuditLog row written alongside them (see
    // WorkflowEngineService.triggerManual / this.retryExecution below).
    // Event/schedule/webhook-triggered executions legitimately have none: there
    // is no human actor for "an order was delivered", so `actor` stays null.
    const auditEntry = await this.prisma.auditLog.findFirst({
      where: {
        organizationId,
        entityType: 'WorkflowExecution',
        entityId: execution.id,
        action: { in: ['workflow.execution.triggered', 'workflow.execution.retried'] },
      },
      include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ...execution,
      durationMs: execution.completedAt
        ? execution.completedAt.getTime() - execution.startedAt.getTime()
        : null,
      actor: auditEntry?.actor ?? null,
      // Pulled from each step's recorded output rather than re-deriving from
      // the event payload — the output is what the action actually touched,
      // which for e.g. assign_driver's order-vs-dispatch branching is not
      // always the same id the trigger payload carried.
      affectedEntities: execution.steps
        .map((step) => extractAffectedEntity(step.output))
        .filter((entity): entity is AffectedEntity => entity !== null),
    };
  }

  async cancelExecution(organizationId: string, userId: string, executionId: string) {
    const execution = await this.prisma.workflowExecution.findFirst({
      where: { id: executionId, organizationId },
    });
    if (!execution) throw new NotFoundException('Execution not found');

    if (!['PENDING', 'QUEUED', 'RUNNING'].includes(execution.status)) {
      throw new ConflictException('Execution is not in a cancellable state');
    }

    const updated = await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'workflow.execution.cancelled',
      entityType: 'WorkflowExecution',
      entityId: executionId,
    });

    return updated;
  }

  async retryExecution(organizationId: string, userId: string, executionId: string) {
    const execution = await this.prisma.workflowExecution.findFirst({
      where: { id: executionId, organizationId },
      include: { workflow: true },
    });
    if (!execution) throw new NotFoundException('Execution not found');

    if (!['FAILED', 'TIMED_OUT', 'CANCELLED'].includes(execution.status)) {
      throw new ConflictException('Only failed/timed-out/cancelled executions can be retried');
    }

    const newExecution = await this.prisma.workflowExecution.create({
      data: {
        workflowId: execution.workflowId,
        versionId: execution.versionId,
        organizationId,
        trigger: execution.trigger,
        eventPayload: execution.eventPayload as Prisma.InputJsonValue ?? Prisma.DbNull,
        status: 'PENDING',
        retryCount: execution.retryCount + 1,
      },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'workflow.execution.retried',
      entityType: 'WorkflowExecution',
      entityId: newExecution.id,
      metadata: { originalExecutionId: executionId },
    });

    // Previously created a PENDING row and never ran it — retries appeared
    // stuck forever in the executions UI.
    this.engine.executeAsync(newExecution.id);

    return newExecution;
  }

  async getTemplates() {
    return this.prisma.workflowTemplate.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async createFromTemplate(organizationId: string, userId: string, templateId: string, name?: string) {
    const template = await this.prisma.workflowTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new NotFoundException('Template not found');

    return this.create(organizationId, userId, {
      name: name || template.name,
      description: template.description ?? undefined,
      config: template.config as Record<string, unknown>,
    });
  }

  private validateConfig(config: Record<string, unknown>) {
    if (!config) throw new BadRequestException('Config is required');
    const trigger = config.trigger as { event?: string } | undefined;
    if (!trigger?.event) throw new BadRequestException('Trigger event is required');

    const actions = config.actions as Array<{ type?: string }> | undefined;
    if (!actions || actions.length === 0) {
      throw new BadRequestException('At least one action is required');
    }
    for (const action of actions) {
      if (!action.type) throw new BadRequestException('Each action must have a type');
    }
  }
}
