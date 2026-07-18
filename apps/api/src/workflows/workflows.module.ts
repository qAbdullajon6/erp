import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { DeveloperModule } from '../developer/developer.module';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsWebhookController } from './workflows-webhook.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowEngineService } from './engine/workflow-engine.service';
import { ConditionEvaluator } from './engine/condition-evaluator';
import { ActionExecutor } from './actions/action-executor';
import { WorkflowEventService } from './triggers/workflow-event.service';
import { WorkflowSchedulerService } from './triggers/workflow-scheduler.service';

/// Imports DeveloperModule for WebhookEventService, which WorkflowEventService
/// fans domain events out to. The arrow only points this way — DeveloperModule
/// imports nothing from here.
@Module({
  imports: [PrismaModule, AuditModule, MailModule, DeveloperModule],
  controllers: [WorkflowsController, WorkflowsWebhookController],
  providers: [
    WorkflowsService,
    WorkflowEngineService,
    ConditionEvaluator,
    ActionExecutor,
    WorkflowEventService,
    WorkflowSchedulerService,
  ],
  exports: [WorkflowsService, WorkflowEventService, WorkflowEngineService],
})
export class WorkflowsModule {}
