import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowEngineService } from '../engine/workflow-engine.service';

@Injectable()
export class WorkflowSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowSchedulerService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: WorkflowEngineService,
  ) {}

  onModuleInit() {
    this.intervalHandle = setInterval(() => { void this.tick(); }, 60_000);
    this.logger.log('Workflow scheduler started (60s interval)');
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async tick() {
    const now = new Date();

    const dueSchedules = await this.prisma.workflowSchedule.findMany({
      where: {
        active: true,
        OR: [
          { nextRunAt: { lte: now } },
          { nextRunAt: null },
        ],
      },
      include: { workflow: true },
    });

    for (const schedule of dueSchedules) {
      if (!schedule.workflow.active || schedule.workflow.status !== 'PUBLISHED') {
        continue;
      }

      try {
        const execution = await this.prisma.workflowExecution.create({
          data: {
            workflowId: schedule.workflowId,
            organizationId: schedule.organizationId,
            trigger: 'schedule',
            eventPayload: { scheduleId: schedule.id, cron: schedule.cronExpression },
            status: 'PENDING',
          },
        });

        this.engine.executeAsync(execution.id);

        const nextRun = this.computeNextRun(schedule.cronExpression);
        await this.prisma.workflowSchedule.update({
          where: { id: schedule.id },
          data: {
            lastRunAt: now,
            nextRunAt: nextRun,
          },
        });

        this.logger.debug(`Scheduled workflow ${schedule.workflowId} fired, next at ${nextRun?.toISOString()}`);
      } catch (err) {
        this.logger.error(`Failed to fire schedule ${schedule.id}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  private computeNextRun(cronExpression: string): Date | null {
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length < 5) return null;

    const now = new Date();
    const intervalMs = this.estimateIntervalFromCron(parts);
    return new Date(now.getTime() + intervalMs);
  }

  private estimateIntervalFromCron(parts: string[]): number {
    const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

    if (minute !== '*' && hour === '*') {
      return 60 * 60_000;
    }
    if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && dayOfWeek === '*') {
      return 24 * 60 * 60_000;
    }
    if (dayOfWeek !== '*') {
      return 7 * 24 * 60 * 60_000;
    }
    if (dayOfMonth !== '*') {
      return 30 * 24 * 60 * 60_000;
    }

    return 60_000;
  }
}
