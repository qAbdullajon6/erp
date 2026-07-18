import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ActionExecutor } from '../actions/action-executor';
import { ConditionEvaluator } from './condition-evaluator';
import { Prisma } from '@prisma/client';

export interface ExecutionContext {
  organizationId: string;
  workflowId: string;
  executionId: string;
  trigger: string;
  eventPayload: Record<string, unknown>;
  variables: Record<string, unknown>;
  stepResults: Record<number, unknown>;
}

const MAX_LOOP_ITERATIONS = 100;
const DEFAULT_TIMEOUT_MS = 300_000;

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);
  private readonly activeExecutions = new Map<string, AbortController>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly actionExecutor: ActionExecutor,
    private readonly conditionEvaluator: ConditionEvaluator,
  ) {}

  async triggerManual(
    organizationId: string,
    userId: string,
    workflowId: string,
    eventPayload?: Record<string, unknown>,
    idempotencyKey?: string,
  ) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, organizationId },
    });
    if (!workflow) throw new NotFoundException('Workflow not found');

    if (idempotencyKey) {
      const existing = await this.prisma.workflowExecution.findUnique({
        where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
      });
      if (existing) return existing;
    }

    let execution;
    try {
      execution = await this.prisma.workflowExecution.create({
        data: {
          workflowId,
          organizationId,
          trigger: 'manual',
          eventPayload: (eventPayload ?? Prisma.DbNull) as Prisma.InputJsonValue,
          status: 'PENDING',
          idempotencyKey: idempotencyKey ?? null,
        },
      });
    } catch (err) {
      // Handle race condition: concurrent request already created with same idempotency key
      if (idempotencyKey && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.workflowExecution.findUnique({
          where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
        });
        if (existing) return existing;
      }
      throw err;
    }

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'workflow.execution.triggered',
      entityType: 'WorkflowExecution',
      entityId: execution.id,
      metadata: { workflowId, trigger: 'manual' },
    });

    this.executeAsync(execution.id);
    return execution;
  }

  async triggerByEvent(
    organizationId: string,
    triggerEvent: string,
    eventPayload: Record<string, unknown>,
  ) {
    const workflows = await this.prisma.workflow.findMany({
      where: {
        organizationId,
        active: true,
        status: 'PUBLISHED',
      },
    });

    const matched = workflows.filter((wf) => {
      const config = wf.config as { trigger?: { event?: string } };
      return config?.trigger?.event === triggerEvent;
    });

    const executions = [];
    for (const workflow of matched) {
      const config = workflow.config as {
        trigger?: { event?: string; filters?: Record<string, unknown> };
        conditions?: unknown;
      };

      if (config.conditions) {
        const passes = this.conditionEvaluator.evaluate(config.conditions, eventPayload);
        if (!passes) continue;
      }

      const execution = await this.prisma.workflowExecution.create({
        data: {
          workflowId: workflow.id,
          organizationId,
          trigger: triggerEvent,
          eventPayload: eventPayload as Prisma.InputJsonValue,
          status: 'PENDING',
        },
      });

      executions.push(execution);
      this.executeAsync(execution.id);
    }

    return executions;
  }

  executeAsync(executionId: string) {
    setImmediate(() => {
      this.runExecution(executionId).catch((err: Error) => {
        this.logger.error(`Unhandled execution error for ${executionId}: ${err.message}`, err.stack);
      });
    });
  }

  async runExecution(executionId: string) {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      include: { workflow: true },
    });
    if (!execution || !execution.workflow) return;

    if (execution.status === 'CANCELLED') return;

    const abortController = new AbortController();
    this.activeExecutions.set(executionId, abortController);

    const timeoutMs = execution.timeoutMs || DEFAULT_TIMEOUT_MS;
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      await this.prisma.workflowExecution.update({
        where: { id: executionId },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      await this.writeLog(executionId, 'INFO', null, 'Execution started');

      const config = execution.workflow.config as {
        trigger?: Record<string, unknown>;
        conditions?: unknown;
        actions?: Array<{ type: string; config?: Record<string, unknown> }>;
        variables?: Record<string, unknown>;
      };

      const actions = config.actions ?? [];
      const context: ExecutionContext = {
        organizationId: execution.organizationId,
        workflowId: execution.workflowId,
        executionId,
        trigger: execution.trigger,
        eventPayload: (execution.eventPayload as Record<string, unknown>) ?? {},
        variables: (config.variables as Record<string, unknown>) ?? {},
        stepResults: {},
      };

      const maxSteps = Math.min(actions.length, MAX_LOOP_ITERATIONS);
      for (let i = 0; i < maxSteps; i++) {
        if (abortController.signal.aborted) {
          await this.prisma.workflowExecution.update({
            where: { id: executionId },
            data: { status: 'TIMED_OUT', completedAt: new Date(), error: 'Execution timed out' },
          });
          await this.writeLog(executionId, 'ERROR', `step_${i}`, 'Execution timed out');
          return;
        }

        const recheck = await this.prisma.workflowExecution.findUnique({ where: { id: executionId } });
        if (recheck?.status === 'CANCELLED') {
          await this.writeLog(executionId, 'WARN', `step_${i}`, 'Execution cancelled');
          return;
        }

        const action = actions[i];
        const step = await this.prisma.workflowExecutionStep.create({
          data: {
            executionId,
            stepIndex: i,
            actionType: action.type,
            actionConfig: (action.config ?? {}) as Prisma.InputJsonValue,
            status: 'RUNNING',
            startedAt: new Date(),
          },
        });

        try {
          if (action.type === 'condition') {
            const condConfig = action.config as { conditions?: unknown; skipSteps?: number };
            const passes = this.conditionEvaluator.evaluate(
              condConfig?.conditions,
              context.eventPayload,
            );
            if (!passes) {
              const skipCount = Math.max(1, Number(condConfig?.skipSteps) || 1);
              i += skipCount;
              await this.prisma.workflowExecutionStep.update({
                where: { id: step.id },
                data: { status: 'COMPLETED', completedAt: new Date(), output: { skipped: true, skipCount } as Prisma.InputJsonValue },
              });
              await this.writeLog(executionId, 'INFO', `step_${i - skipCount}`, `Condition not met, skipping ${skipCount} step(s)`);
              continue;
            }
          }

          if (action.type === 'delay') {
            const delayMs = Math.min((action.config as { delayMs?: number })?.delayMs ?? 1000, 60_000);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            await this.prisma.workflowExecutionStep.update({
              where: { id: step.id },
              data: { status: 'COMPLETED', completedAt: new Date(), output: { delayed: delayMs } as Prisma.InputJsonValue },
            });
            await this.writeLog(executionId, 'INFO', `step_${i}`, `Delayed ${delayMs}ms`);
            continue;
          }

          if (action.type === 'approval') {
            await this.prisma.workflowExecutionStep.update({
              where: { id: step.id },
              data: { status: 'WAITING' },
            });
            await this.prisma.workflowExecution.update({
              where: { id: executionId },
              data: { status: 'PENDING' },
            });
            await this.writeLog(executionId, 'INFO', `step_${i}`, 'Waiting for manual approval');
            return;
          }

          const result = await this.actionExecutor.execute(action.type, action.config ?? {}, context);
          context.stepResults[i] = result;

          await this.prisma.workflowExecutionStep.update({
            where: { id: step.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              output: (result ?? {}) as Prisma.InputJsonValue,
            },
          });
          await this.writeLog(executionId, 'INFO', `step_${i}`, `Action ${action.type} completed`);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          await this.prisma.workflowExecutionStep.update({
            where: { id: step.id },
            data: { status: 'FAILED', completedAt: new Date(), error: errorMessage },
          });
          await this.writeLog(executionId, 'ERROR', `step_${i}`, `Action ${action.type} failed: ${errorMessage}`);

          await this.prisma.workflowExecution.update({
            where: { id: executionId },
            data: { status: 'FAILED', completedAt: new Date(), error: errorMessage },
          });
          return;
        }
      }

      await this.prisma.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          context: context.variables as Prisma.InputJsonValue,
        },
      });
      await this.writeLog(executionId, 'INFO', null, 'Execution completed successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Execution ${executionId} crashed: ${errorMessage}`);
      await this.prisma.workflowExecution.update({
        where: { id: executionId },
        data: { status: 'FAILED', completedAt: new Date(), error: errorMessage },
      }).catch(() => {});
      await this.writeLog(executionId, 'ERROR', null, `Execution crashed: ${errorMessage}`).catch(() => {});
    } finally {
      clearTimeout(timeout);
      this.activeExecutions.delete(executionId);
    }
  }

  private async writeLog(executionId: string, level: string, step: string | null, message: string) {
    await this.prisma.workflowLog.create({
      data: { executionId, level, step, message },
    });
  }

  isExecutionActive(executionId: string): boolean {
    return this.activeExecutions.has(executionId);
  }
}
