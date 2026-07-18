import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, HttpCode, ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkflowsService } from './workflows.service';
import { WorkflowEngineService } from './engine/workflow-engine.service';
import { TRIGGER_DEFINITIONS } from './triggers/trigger-registry';
import { ACTION_DEFINITIONS } from './actions/action-registry';
import { MembershipRole } from '@prisma/client';

interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  role: MembershipRole;
}

const WORKFLOW_ROLES: MembershipRole[] = ['ADMIN', 'OPERATIONS_MANAGER'];
const WORKFLOW_READ_ROLES: MembershipRole[] = ['ADMIN', 'OPERATIONS_MANAGER', 'DISPATCHER', 'ACCOUNTANT', 'SALES_CRM_MANAGER'];

@Controller('workflows')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkflowsController {
  constructor(
    private readonly service: WorkflowsService,
    private readonly engine: WorkflowEngineService,
  ) {}

  @Get()
  @Roles(...WORKFLOW_READ_ROLES)
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string>) {
    const result = await this.service.list(user.organizationId, {
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      active: query.active,
      status: query.status as any,
      search: query.search,
    });
    return result;
  }

  @Get('triggers')
  @Roles(...WORKFLOW_READ_ROLES)
  getTriggers() {
    return TRIGGER_DEFINITIONS;
  }

  @Get('actions')
  @Roles(...WORKFLOW_READ_ROLES)
  getActions() {
    return ACTION_DEFINITIONS;
  }

  @Get('templates')
  @Roles(...WORKFLOW_READ_ROLES)
  async getTemplates() {
    const templates = await this.service.getTemplates();
    return templates;
  }

  @Get(':id')
  @Roles(...WORKFLOW_READ_ROLES)
  async getById(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const workflow = await this.service.getById(user.organizationId, id);
    return workflow;
  }

  @Post()
  @Roles(...WORKFLOW_ROLES)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: {
    name: string;
    description?: string;
    config: Record<string, unknown>;
    active?: boolean;
  }) {
    const workflow = await this.service.create(user.organizationId, user.userId, body);
    return workflow;
  }

  @Patch(':id')
  @Roles(...WORKFLOW_ROLES)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: {
      name?: string;
      description?: string;
      config?: Record<string, unknown>;
      active?: boolean;
    },
  ) {
    const workflow = await this.service.update(user.organizationId, user.userId, id, body);
    return workflow;
  }

  @Delete(':id')
  @Roles(...WORKFLOW_ROLES)
  @HttpCode(204)
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.service.delete(user.organizationId, user.userId, id);
  }

  @Post(':id/toggle')
  @Roles(...WORKFLOW_ROLES)
  @HttpCode(200)
  async toggle(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const workflow = await this.service.toggle(user.organizationId, user.userId, id);
    return workflow;
  }

  @Post(':id/publish')
  @Roles(...WORKFLOW_ROLES)
  @HttpCode(200)
  async publish(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const workflow = await this.service.publish(user.organizationId, user.userId, id);
    return workflow;
  }

  @Post(':id/archive')
  @Roles(...WORKFLOW_ROLES)
  @HttpCode(200)
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const workflow = await this.service.archive(user.organizationId, user.userId, id);
    return workflow;
  }

  @Post(':id/duplicate')
  @Roles(...WORKFLOW_ROLES)
  async duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { name?: string },
  ) {
    const workflow = await this.service.duplicate(user.organizationId, user.userId, id, body.name);
    return workflow;
  }

  @Get(':id/export')
  @Roles(...WORKFLOW_ROLES)
  async exportWorkflow(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const exported = await this.service.exportWorkflow(user.organizationId, id);
    return exported;
  }

  @Post('import')
  @Roles(...WORKFLOW_ROLES)
  async importWorkflow(@CurrentUser() user: AuthenticatedUser, @Body() body: {
    name: string;
    description?: string;
    config: Record<string, unknown>;
  }) {
    const workflow = await this.service.importWorkflow(user.organizationId, user.userId, body);
    return workflow;
  }

  @Post(':id/execute')
  @Roles(...WORKFLOW_ROLES)
  @HttpCode(200)
  async execute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { eventPayload?: Record<string, unknown>; idempotencyKey?: string },
  ) {
    const execution = await this.engine.triggerManual(
      user.organizationId,
      user.userId,
      id,
      body.eventPayload,
      body.idempotencyKey,
    );
    return execution;
  }

  @Get(':id/executions')
  @Roles(...WORKFLOW_READ_ROLES)
  async getExecutions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: Record<string, string>,
  ) {
    const result = await this.service.getExecutions(user.organizationId, id, {
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      status: query.status as any,
    });
    return result;
  }

  @Get('executions/:executionId')
  @Roles(...WORKFLOW_READ_ROLES)
  async getExecution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('executionId', ParseUUIDPipe) executionId: string,
  ) {
    const execution = await this.service.getExecution(user.organizationId, executionId);
    return execution;
  }

  @Post('executions/:executionId/cancel')
  @Roles(...WORKFLOW_ROLES)
  @HttpCode(200)
  async cancelExecution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('executionId', ParseUUIDPipe) executionId: string,
  ) {
    const execution = await this.service.cancelExecution(user.organizationId, user.userId, executionId);
    return execution;
  }

  @Post('executions/:executionId/retry')
  @Roles(...WORKFLOW_ROLES)
  @HttpCode(200)
  async retryExecution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('executionId', ParseUUIDPipe) executionId: string,
  ) {
    const execution = await this.service.retryExecution(user.organizationId, user.userId, executionId);
    return execution;
  }

  @Post('from-template/:templateId')
  @Roles(...WORKFLOW_ROLES)
  async createFromTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() body: { name?: string },
  ) {
    const workflow = await this.service.createFromTemplate(
      user.organizationId,
      user.userId,
      templateId,
      body.name,
    );
    return workflow;
  }
}
