import { Controller, Post, Param, Body, Headers, UnauthorizedException, NotFoundException, HttpCode } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowEngineService } from './engine/workflow-engine.service';
import { createHash, timingSafeEqual } from 'crypto';

@Controller('webhooks/workflows')
export class WorkflowsWebhookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: WorkflowEngineService,
  ) {}

  @Post(':orgId/:path')
  @HttpCode(200)
  async triggerWebhook(
    @Param('orgId') orgId: string,
    @Param('path') path: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    const webhook = await this.prisma.workflowWebhook.findUnique({
      where: { organizationId_path: { organizationId: orgId, path } },
      include: { workflow: true },
    });

    if (!webhook || !webhook.active) {
      throw new NotFoundException('Webhook not found');
    }

    const providedHash = createHash('sha256').update(secret ?? '').digest();
    const expectedHash = Buffer.from(webhook.secretHash, 'hex');
    if (providedHash.length !== expectedHash.length || !timingSafeEqual(providedHash, expectedHash)) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    if (!webhook.workflow.active || webhook.workflow.status !== 'PUBLISHED') {
      return { triggered: false, reason: 'Workflow is not active or published' };
    }

    const execution = await this.prisma.workflowExecution.create({
      data: {
        workflowId: webhook.workflowId,
        organizationId: webhook.organizationId,
        trigger: 'webhook',
        eventPayload: body as any,
        status: 'PENDING',
      },
    });

    this.engine.executeAsync(execution.id);

    await this.prisma.workflowWebhook.update({
      where: { id: webhook.id },
      data: { lastCalledAt: new Date() },
    });

    return { triggered: true, executionId: execution.id };
  }
}
