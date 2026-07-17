import { Injectable, Logger } from '@nestjs/common';
import { WorkflowEngineService } from '../engine/workflow-engine.service';
import { WebhookEventService } from '../../developer/webhooks/webhook-event.service';

/// The single fan-out point for domain events. Every notable thing that
/// happens in the domain is announced here by exactly one `emit` call (see
/// the ~17 call sites across the domain services), and this decides who hears
/// about it: the workflow engine, and any subscribed webhook endpoint.
///
/// Kept as one emit surface rather than one per consumer. A parallel
/// `webhookEvents.emit(...)` beside each existing call would double the sites
/// a new event has to be added to, and the first time someone updated only
/// one of the pair the two consumers would silently disagree about which
/// events exist.
///
/// The name is narrower than what this now does — it predates webhooks being
/// a consumer. Renaming it touches all 17 call sites across 8 domain modules,
/// so it is left alone deliberately rather than churned as a side effect of
/// this feature; recorded in TECHNICAL_DEBT.md.
///
/// Nothing here ever throws to the caller. A domain operation must never fail
/// because an observer of it failed — that is the whole contract that lets
/// these calls sit un-awaited at the end of a service method.
@Injectable()
export class WorkflowEventService {
  private readonly logger = new Logger(WorkflowEventService.name);

  constructor(
    private readonly engine: WorkflowEngineService,
    private readonly webhooks: WebhookEventService,
  ) {}

  async emit(organizationId: string, event: string, payload: Record<string, unknown>) {
    // Consumers are independent: a failing workflow engine must not cost the
    // webhook its delivery, so neither is inside the other's try.
    try {
      const executions = await this.engine.triggerByEvent(organizationId, event, payload);
      if (executions.length > 0) {
        this.logger.log(
          `Event "${event}" triggered ${executions.length} workflow(s) in org ${organizationId}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to process workflow event "${event}": ${err instanceof Error ? err.message : err}`,
      );
    }

    // WebhookEventService swallows its own failures; this try is belt-and-braces
    // against a constructor-level or programming error escaping it.
    try {
      await this.webhooks.emit(organizationId, event, payload);
    } catch (err) {
      this.logger.error(
        `Failed to process webhook event "${event}": ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
