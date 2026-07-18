import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WorkflowStatus, WorkflowExecutionStatus, Prisma } from '@prisma/client';

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
    const workflow = await this.prisma.workflow.create({
      data: {
        organizationId,
        createdByUserId: userId,
        name: input.name,
        description: input.description ?? null,
        config: input.config as Prisma.InputJsonValue,
        active: input.active ?? false,
        status: 'DRAFT',
      },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'workflow.created',
      entityType: 'Workflow',
      entityId: workflow.id,
      metadata: { name: workflow.name },
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

    const updated = await this.prisma.workflow.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.config !== undefined && { config: input.config as Prisma.InputJsonValue }),
        ...(input.active !== undefined && { active: input.active }),
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
        include: { logs: { orderBy: { createdAt: 'asc' }, take: 50 } },
      }),
      this.prisma.workflowExecution.count({ where }),
    ]);

    return {
      items,
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
    return execution;
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
