import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { WebhookDispatcherService } from "./webhook-dispatcher.service";

/// Fans one domain event out to every endpoint in that organization
/// subscribed to it.
///
/// Consumes the same event stream as WorkflowEventService rather than
/// introducing a second set of emit call sites: the 17 existing
/// `workflowEvents.emit(...)` calls across the domain services already mark
/// every point where something notable happened, and a parallel set of
/// `webhookEvents.emit(...)` calls beside them would be one refactor away
/// from disagreeing about which events exist. See WorkflowEventService for
/// where the fan-out happens.
///
/// Like WorkflowEventService, this never throws to its caller: a webhook is
/// an observer of a domain operation, and an observer must not be able to
/// fail the thing it observes.
@Injectable()
export class WebhookEventService {
  private readonly logger = new Logger(WebhookEventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: WebhookDispatcherService,
  ) {}

  async emit(
    organizationId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const endpoints = await this.prisma.webhookEndpoint.findMany({
        where: {
          organizationId,
          isActive: true,
          // Array membership, evaluated in the database: loading every
          // endpoint to filter in JS would read the whole table on each event.
          events: { has: event },
        },
        select: { id: true },
      });

      if (endpoints.length === 0) return;

      // The envelope is versioned and self-describing so a receiver can route
      // on `event` without inferring it from the payload's shape.
      const body = {
        event,
        organizationId,
        occurredAt: new Date().toISOString(),
        data: payload,
      };

      for (const endpoint of endpoints) {
        await this.dispatcher.enqueue({
          organizationId,
          endpointId: endpoint.id,
          event,
          payload: body,
        });
      }

      this.logger.log(
        `Event "${event}" queued for ${endpoints.length} webhook endpoint(s) in org ${organizationId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to fan out webhook event "${event}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
