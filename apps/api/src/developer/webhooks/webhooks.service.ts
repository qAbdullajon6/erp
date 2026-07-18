import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { WebhookEndpoint } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import type { WebhookConfig } from "../../config/configuration";
import { WebhookDispatcherService } from "./webhook-dispatcher.service";
import { generateWebhookSecret } from "./webhook-signature.util";
import { assertSafeWebhookUrl, WebhookUrlError } from "./webhook-url.util";
import { WEBHOOK_EVENTS } from "./dto/webhook.dto";
import type { CreateWebhookDto, UpdateWebhookDto } from "./dto/webhook.dto";

/// The endpoint as returned to clients. `secret` is present only on the
/// create and rotate responses — see toResponse.
export interface WebhookEndpointResponse {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  version: number;
  description: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  createdAt: string;
  updatedAt: string;
  secret?: string;
}

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dispatcher: WebhookDispatcherService,
    private readonly config: ConfigService,
  ) {}

  private get allowPrivateTargets(): boolean {
    return this.config.getOrThrow<WebhookConfig>("webhook").allowPrivateTargets;
  }

  /// The signing secret is deliberately withheld from list/get. It is shown
  /// once at create and once at rotate — a secret readable from a list
  /// endpoint is one CSRF or over-broad session away from being everyone's.
  /// Callers who lost it rotate; they do not re-read it.
  private toResponse(endpoint: WebhookEndpoint, secret?: string): WebhookEndpointResponse {
    return {
      id: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      events: endpoint.events,
      isActive: endpoint.isActive,
      version: endpoint.version,
      description: endpoint.description,
      lastSuccessAt: endpoint.lastSuccessAt?.toISOString() ?? null,
      lastFailureAt: endpoint.lastFailureAt?.toISOString() ?? null,
      lastFailureReason: endpoint.lastFailureReason,
      createdAt: endpoint.createdAt.toISOString(),
      updatedAt: endpoint.updatedAt.toISOString(),
      ...(secret ? { secret } : {}),
    };
  }

  private assertKnownEvents(events: string[]): void {
    const known = new Set<string>(WEBHOOK_EVENTS);
    const unknown = events.filter((event) => !known.has(event));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown event(s): ${unknown.join(", ")}. Supported: ${WEBHOOK_EVENTS.join(", ")}`,
      );
    }
  }

  private assertSafeUrl(url: string): void {
    try {
      assertSafeWebhookUrl(url, this.allowPrivateTargets);
    } catch (err) {
      if (err instanceof WebhookUrlError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  private async findOrThrow(organizationId: string, id: string): Promise<WebhookEndpoint> {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id, organizationId },
    });
    if (!endpoint) throw new NotFoundException("Webhook endpoint not found");
    return endpoint;
  }

  async list(organizationId: string): Promise<{ items: WebhookEndpointResponse[] }> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return { items: endpoints.map((e) => this.toResponse(e)) };
  }

  async get(organizationId: string, id: string): Promise<WebhookEndpointResponse> {
    return this.toResponse(await this.findOrThrow(organizationId, id));
  }

  async create(
    actor: CurrentUserPayload,
    dto: CreateWebhookDto,
  ): Promise<WebhookEndpointResponse> {
    this.assertKnownEvents(dto.events);
    this.assertSafeUrl(dto.url);

    const secret = generateWebhookSecret();
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        organizationId: actor.organizationId,
        name: dto.name,
        url: dto.url,
        secret,
        events: dto.events,
        description: dto.description ?? null,
        createdByUserId: actor.userId,
      },
    });

    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "webhook.create",
      entityType: "WebhookEndpoint",
      entityId: endpoint.id,
      metadata: { name: endpoint.name, url: endpoint.url, events: endpoint.events },
    });

    return this.toResponse(endpoint, secret);
  }

  async update(
    actor: CurrentUserPayload,
    id: string,
    dto: UpdateWebhookDto,
  ): Promise<WebhookEndpointResponse> {
    await this.findOrThrow(actor.organizationId, id);
    if (dto.events) this.assertKnownEvents(dto.events);
    if (dto.url) this.assertSafeUrl(dto.url);

    const endpoint = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.url !== undefined ? { url: dto.url } : {}),
        ...(dto.events !== undefined ? { events: dto.events } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });

    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "webhook.update",
      entityType: "WebhookEndpoint",
      entityId: endpoint.id,
      metadata: { name: endpoint.name, url: endpoint.url, events: endpoint.events },
    });

    return this.toResponse(endpoint);
  }

  async remove(actor: CurrentUserPayload, id: string): Promise<void> {
    await this.findOrThrow(actor.organizationId, id);

    // Deliveries cascade (see the schema relation): the history is meaningless
    // without the endpoint it belonged to, and keeping orphans would leave the
    // Deliveries tab pointing at a webhook that no longer exists.
    await this.prisma.webhookEndpoint.delete({ where: { id } });

    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "webhook.delete",
      entityType: "WebhookEndpoint",
      entityId: id,
    });
  }

  async setEnabled(
    actor: CurrentUserPayload,
    id: string,
    enabled: boolean,
  ): Promise<WebhookEndpointResponse> {
    await this.findOrThrow(actor.organizationId, id);

    const endpoint = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: { isActive: enabled },
    });

    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: enabled ? "webhook.enable" : "webhook.disable",
      entityType: "WebhookEndpoint",
      entityId: endpoint.id,
      metadata: { name: endpoint.name },
    });

    return this.toResponse(endpoint);
  }

  /// Mints a fresh signing secret. The old secret stops signing immediately;
  /// `version` is bumped so an operator correlating a receiver's rejections
  /// can tell which side is stale.
  async rotateSecret(
    actor: CurrentUserPayload,
    id: string,
  ): Promise<WebhookEndpointResponse> {
    await this.findOrThrow(actor.organizationId, id);

    const secret = generateWebhookSecret();
    const endpoint = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: { secret, version: { increment: 1 } },
    });

    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "webhook.rotate_secret",
      entityType: "WebhookEndpoint",
      entityId: endpoint.id,
      metadata: { name: endpoint.name, version: endpoint.version },
    });

    return this.toResponse(endpoint, secret);
  }

  /// Sends a synthetic payload and waits for it to settle, so the caller sees
  /// a real outcome rather than "queued". This is the one delivery path that
  /// is deliberately synchronous: the whole point of the button is to answer
  /// "is my receiver reachable right now".
  async test(actor: CurrentUserPayload, id: string, event?: string) {
    const endpoint = await this.findOrThrow(actor.organizationId, id);

    const testEvent = event ?? endpoint.events[0] ?? "order.created";
    if (event) this.assertKnownEvents([event]);

    const delivery = await this.dispatcher.enqueue({
      organizationId: actor.organizationId,
      endpointId: endpoint.id,
      event: testEvent,
      payload: {
        test: true,
        event: testEvent,
        endpointId: endpoint.id,
        message: "This is a test delivery from FlowERP",
        timestamp: new Date().toISOString(),
      },
    });

    await this.dispatcher.deliverNow(delivery.id);

    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "webhook.test",
      entityType: "WebhookEndpoint",
      entityId: endpoint.id,
      metadata: { deliveryId: delivery.id, event: testEvent },
    });

    return this.getDelivery(actor.organizationId, endpoint.id, delivery.id);
  }

  async listDeliveries(
    organizationId: string,
    webhookId: string,
    query: { limit?: number; status?: string } = {},
  ) {
    await this.findOrThrow(organizationId, webhookId);

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const items = await this.prisma.webhookDelivery.findMany({
      where: {
        endpointId: webhookId,
        organizationId,
        ...(query.status ? { status: query.status as never } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return {
      items: items.map((d) => ({
        id: d.id,
        endpointId: d.endpointId,
        event: d.event,
        status: d.status,
        httpStatus: d.httpStatus,
        attemptCount: d.attemptCount,
        durationMs: d.durationMs,
        errorMessage: d.errorMessage,
        createdAt: d.createdAt.toISOString(),
        completedAt: d.completedAt?.toISOString() ?? null,
        failedAt: d.failedAt?.toISOString() ?? null,
      })),
    };
  }

  async getDelivery(organizationId: string, webhookId: string, deliveryId: string) {
    await this.findOrThrow(organizationId, webhookId);

    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, endpointId: webhookId, organizationId },
      include: { deliveryAttempts: { orderBy: { attemptNumber: "asc" } } },
    });
    if (!delivery) throw new NotFoundException("Delivery not found");

    return {
      id: delivery.id,
      endpointId: delivery.endpointId,
      event: delivery.event,
      status: delivery.status,
      httpStatus: delivery.httpStatus,
      attemptCount: delivery.attemptCount,
      payload: delivery.payload,
      requestHeaders: delivery.requestHeaders,
      responseBody: delivery.responseBody,
      errorMessage: delivery.errorMessage,
      durationMs: delivery.durationMs,
      replayOfId: delivery.replayOfId,
      createdAt: delivery.createdAt.toISOString(),
      completedAt: delivery.completedAt?.toISOString() ?? null,
      failedAt: delivery.failedAt?.toISOString() ?? null,
      deliveryAttempts: delivery.deliveryAttempts.map((a) => ({
        id: a.id,
        attemptNumber: a.attemptNumber,
        status: a.status,
        httpStatus: a.httpStatus,
        responseBody: a.responseBody,
        durationMs: a.durationMs,
        errorMessage: a.errorMessage,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  /// Re-sends an existing delivery's exact payload as a NEW delivery, linked
  /// back via replayOfId. The original is never mutated: its history is
  /// evidence of what happened, and overwriting it to retry would destroy the
  /// record the operator is looking at while deciding to retry.
  async replayDelivery(actor: CurrentUserPayload, webhookId: string, deliveryId: string) {
    await this.findOrThrow(actor.organizationId, webhookId);

    const original = await this.prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, endpointId: webhookId, organizationId: actor.organizationId },
    });
    if (!original) throw new NotFoundException("Delivery not found");

    const replay = await this.dispatcher.enqueue({
      organizationId: actor.organizationId,
      endpointId: original.endpointId,
      event: original.event,
      payload: original.payload as Record<string, unknown>,
      replayOfId: original.id,
    });

    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "webhook.replay",
      entityType: "WebhookDelivery",
      entityId: replay.id,
      metadata: { replayOfId: original.id, event: original.event },
    });

    return { replayId: replay.id, newDeliveryId: replay.id, originalDeliveryId: original.id };
  }

  /// Re-queues a delivery that exhausted its retries, resetting the backoff
  /// so the drain loop picks it up immediately. Unlike replay this reuses the
  /// same row — the operator is saying "that same delivery should go through",
  /// so its attempt history continues rather than forking.
  async retryDelivery(actor: CurrentUserPayload, webhookId: string, deliveryId: string) {
    await this.findOrThrow(actor.organizationId, webhookId);

    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, endpointId: webhookId, organizationId: actor.organizationId },
    });
    if (!delivery) throw new NotFoundException("Delivery not found");

    if (delivery.status !== "FAILED") {
      throw new ConflictException(
        `Only a FAILED delivery can be retried; this one is ${delivery.status}`,
      );
    }

    await this.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "PENDING",
        nextAttemptAt: new Date(),
        // attemptCount is NOT reset: it is the count of physical attempts
        // ever made, and the attempt rows keep numbering from it.
        failedAt: null,
      },
    });

    await this.dispatcher.deliverNow(delivery.id);

    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "webhook.retry",
      entityType: "WebhookDelivery",
      entityId: delivery.id,
      metadata: { event: delivery.event },
    });

    return this.getDelivery(actor.organizationId, webhookId, delivery.id);
  }
}
