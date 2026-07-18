import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { WebhookConfig } from "../../config/configuration";
import { signWebhookPayload } from "./webhook-signature.util";
import { assertSafeWebhookUrl, WebhookUrlError } from "./webhook-url.util";
import { WebhookCircuitBreaker, CircuitState } from "./webhook-circuit-breaker";

/// How often the drain loop looks for due work.
const POLL_INTERVAL_MS = 5_000;
/// Ceiling on a single drain pass, so a large backlog is worked through over
/// several passes instead of one unbounded burst.
const DRAIN_BATCH_SIZE = 20;
/// Response bodies are stored for debugging, not archival. A receiver that
/// returns a megabyte of HTML must not put a megabyte into every row.
const MAX_STORED_BODY_CHARS = 4_000;

/// Delivers webhook payloads out-of-band, with retries and exponential
/// backoff, and records every physical attempt.
///
/// The queue is the WebhookDelivery table itself, not an in-memory list: a
/// delivery that has not been attempted yet is a PENDING row, so a process
/// restart resumes rather than silently dropping everything in flight. This
/// is the difference between "we tried to send it" and "we will send it".
///
/// Single-instance by design, matching ApiKeyRateLimitGuard: two instances
/// polling the same table would both claim the same row. The claim is
/// compare-and-set (updateMany filtered on the status the row must still
/// have), which makes double-delivery impossible even mid-race — the loser's
/// update matches zero rows and it moves on. Recorded in TECHNICAL_DEBT.md.
@Injectable()
export class WebhookDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDispatcherService.name);
  private timer: NodeJS.Timeout | null = null;
  private draining = false;
  /// Set when a drain is requested while one is already running. Without it,
  /// that request is simply dropped — see drain().
  private drainRequested = false;
  private circuitBreaker: WebhookCircuitBreaker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const webhookConfig = this.config.getOrThrow<WebhookConfig>("webhook");
    this.circuitBreaker = new WebhookCircuitBreaker({
      failureThreshold: webhookConfig.circuitFailureThreshold,
      resetTimeoutMs: webhookConfig.circuitResetTimeoutMs,
      halfOpenRequests: webhookConfig.circuitHalfOpenRequests,
    });
  }

  private get webhookConfig(): WebhookConfig {
    return this.config.getOrThrow<WebhookConfig>("webhook");
  }

  onModuleInit(): void {
    // Not started under test: the e2e suite drives deliveries explicitly via
    // deliverNow() so it can assert on a settled result, and a background
    // loop racing those assertions would make them flaky.
    if (process.env.NODE_ENV === "test") return;

    this.timer = setInterval(() => {
      void this.drain();
    }, POLL_INTERVAL_MS);
    // Never hold the process open just to poll an empty queue.
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /// Creates the delivery row and kicks a drain. Returns as soon as the row
  /// is durable — the HTTP call happens after the caller's response is sent,
  /// so a slow receiver can never slow down the domain operation that
  /// triggered the event.
  async enqueue(params: {
    organizationId: string;
    endpointId: string;
    event: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
    replayOfId?: string;
  }) {
    if (params.idempotencyKey) {
      const existing = await this.prisma.webhookDelivery.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: params.organizationId,
            idempotencyKey: params.idempotencyKey,
          },
        },
      });
      if (existing) return existing;
    }

    let delivery;
    try {
      delivery = await this.prisma.webhookDelivery.create({
        data: {
          organizationId: params.organizationId,
          endpointId: params.endpointId,
          event: params.event,
          payload: params.payload as Prisma.InputJsonValue,
          status: "PENDING",
          nextAttemptAt: new Date(),
          idempotencyKey: params.idempotencyKey ?? null,
          replayOfId: params.replayOfId ?? null,
        },
      });
    } catch (err) {
      // Concurrent enqueue with the same idempotency key: the unique index is
      // the arbiter, and the loser reads back the winner's row rather than
      // surfacing a constraint error. Same pattern as
      // WorkflowEngineService.triggerManual.
      if (
        params.idempotencyKey &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const existing = await this.prisma.webhookDelivery.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: params.organizationId,
              idempotencyKey: params.idempotencyKey,
            },
          },
        });
        if (existing) return existing;
      }
      throw err;
    }

    // Don't await: enqueue's contract is "it is durable and will be sent",
    // not "it has been sent".
    setImmediate(() => {
      void this.drain();
    });

    return delivery;
  }

  /// Works through deliveries that are due.
  ///
  /// Single-flight, but requests that arrive mid-pass are COALESCED rather
  /// than dropped: a plain `if (draining) return` loses the wake-up entirely,
  /// so a row enqueued while a pass was running would sit PENDING until the
  /// next interval tick — and under NODE_ENV=test, where the interval is off,
  /// forever. The do/while re-checks for work before releasing the latch, so
  /// every enqueue is guaranteed a pass that can see its row.
  async drain(): Promise<void> {
    if (this.draining) {
      this.drainRequested = true;
      return;
    }
    this.draining = true;

    try {
      do {
        this.drainRequested = false;

        const due = await this.prisma.webhookDelivery.findMany({
          where: {
            status: "PENDING",
            nextAttemptAt: { lte: new Date() },
          },
          orderBy: { nextAttemptAt: "asc" },
          take: DRAIN_BATCH_SIZE,
          select: { id: true },
        });

        for (const { id } of due) {
          await this.attemptDelivery(id);
        }

        // A full batch means there is probably more waiting; go round again
        // rather than idling until the next tick.
        if (due.length === DRAIN_BATCH_SIZE) this.drainRequested = true;
      } while (this.drainRequested);
    } catch (err) {
      this.logger.error(
        `Webhook drain pass failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.draining = false;
    }
  }

  /// Drives one delivery to a settled state synchronously. Exists for the
  /// test suite and for the "Test" button, both of which need to observe the
  /// outcome rather than trust a background loop to have gotten to it.
  async deliverNow(deliveryId: string): Promise<void> {
    await this.attemptDelivery(deliveryId);
  }

  private async attemptDelivery(deliveryId: string): Promise<void> {
    // Compare-and-set claim: only the caller whose update actually matched a
    // PENDING row proceeds. Without this, the interval tick and an enqueue's
    // setImmediate could both send the same payload.
    const claimed = await this.prisma.webhookDelivery.updateMany({
      where: { id: deliveryId, status: "PENDING" },
      data: { status: "DELIVERING" },
    });
    if (claimed.count === 0) return;

    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { endpoint: true },
    });
    if (!delivery || !delivery.endpoint) return;

    // Circuit breaker: skip delivery if circuit is OPEN
    if (this.circuitBreaker.shouldBlock(delivery.endpointId)) {
      const circuitState = this.circuitBreaker.getState(delivery.endpointId);
      const nextAttempt = nextBackoff(delivery.attemptCount + 1);

      this.logger.warn(
        `Circuit ${circuitState} for endpoint ${delivery.endpoint.name} (${delivery.endpointId}). ` +
        `Skipping delivery ${delivery.id}, will retry at ${nextAttempt.toISOString()}`,
      );

      // Return delivery to PENDING with backoff delay
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "PENDING",
          nextAttemptAt: nextAttempt,
        },
      });
      return;
    }

    const attemptNumber = delivery.attemptCount + 1;
    const body = JSON.stringify(delivery.payload);
    const startedAt = Date.now();

    try {
      // Re-checked at send time, not only at create time: an endpoint's URL
      // could have been edited, and a stored row is not evidence the target
      // is still safe.
      assertSafeWebhookUrl(delivery.endpoint.url, this.webhookConfig.allowPrivateTargets);

      const signature = signWebhookPayload(delivery.endpoint.secret, body);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "FlowERP-Webhooks/1.0",
        "X-FlowERP-Event": delivery.event,
        "X-FlowERP-Delivery": delivery.id,
        "X-FlowERP-Signature": signature,
        "X-FlowERP-Attempt": String(attemptNumber),
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.webhookConfig.timeoutMs);

      try {
        const response = await fetch(delivery.endpoint.url, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
          redirect: "manual",
        });

        const durationMs = Date.now() - startedAt;
        const responseBody = (await response.text().catch(() => "")).slice(
          0,
          MAX_STORED_BODY_CHARS,
        );

        if (response.ok) {
          // Record success in circuit breaker before settling
          this.circuitBreaker.recordSuccess(delivery.endpointId);

          await this.settleSuccess(delivery.id, delivery.endpointId, {
            attemptNumber,
            httpStatus: response.status,
            responseBody,
            durationMs,
            requestHeaders: headers,
          });
          return;
        }

        // Record failure in circuit breaker before settling
        this.circuitBreaker.recordFailure(delivery.endpointId);

        await this.settleFailure(delivery, {
          attemptNumber,
          httpStatus: response.status,
          responseBody,
          durationMs,
          errorMessage: `Endpoint returned HTTP ${response.status}`,
          requestHeaders: headers,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const errorMessage =
        err instanceof WebhookUrlError
          ? err.message
          : err instanceof Error && err.name === "AbortError"
            ? `Request timed out after ${this.webhookConfig.timeoutMs}ms`
            : err instanceof Error
              ? err.message
              : String(err);

      // Record failure in circuit breaker before settling
      this.circuitBreaker.recordFailure(delivery.endpointId);

      await this.settleFailure(delivery, {
        attemptNumber,
        httpStatus: null,
        responseBody: null,
        durationMs,
        errorMessage,
        requestHeaders: null,
      });
    }
  }

  private async settleSuccess(
    deliveryId: string,
    endpointId: string,
    attempt: {
      attemptNumber: number;
      httpStatus: number;
      responseBody: string;
      durationMs: number;
      requestHeaders: Record<string, string>;
    },
  ): Promise<void> {
    const completedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.webhookDeliveryAttempt.create({
        data: {
          deliveryId,
          attemptNumber: attempt.attemptNumber,
          status: "SUCCESS",
          httpStatus: attempt.httpStatus,
          responseBody: attempt.responseBody,
          durationMs: attempt.durationMs,
        },
      }),
      this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "DELIVERED",
          httpStatus: attempt.httpStatus,
          responseBody: attempt.responseBody,
          durationMs: attempt.durationMs,
          attemptCount: attempt.attemptNumber,
          requestHeaders: redactHeaders(attempt.requestHeaders),
          nextAttemptAt: null,
          errorMessage: null,
          completedAt,
        },
      }),
      this.prisma.webhookEndpoint.update({
        where: { id: endpointId },
        data: { lastSuccessAt: completedAt, lastFailureReason: null },
      }),
    ]);
  }

  private async settleFailure(
    delivery: { id: string; endpointId: string; attemptCount: number },
    attempt: {
      attemptNumber: number;
      httpStatus: number | null;
      responseBody: string | null;
      durationMs: number;
      errorMessage: string;
      requestHeaders: Record<string, string> | null;
    },
  ): Promise<void> {
    const exhausted = attempt.attemptNumber >= this.webhookConfig.maxAttempts;
    const failedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.webhookDeliveryAttempt.create({
        data: {
          deliveryId: delivery.id,
          attemptNumber: attempt.attemptNumber,
          status: "FAILED",
          httpStatus: attempt.httpStatus,
          responseBody: attempt.responseBody,
          durationMs: attempt.durationMs,
          errorMessage: attempt.errorMessage,
        },
      }),
      this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          // Back to PENDING (not FAILED) while retries remain: PENDING with a
          // future nextAttemptAt IS the retry queue, so the drain loop picks
          // it up again without any separate scheduler.
          status: exhausted ? "FAILED" : "PENDING",
          httpStatus: attempt.httpStatus,
          responseBody: attempt.responseBody,
          durationMs: attempt.durationMs,
          errorMessage: attempt.errorMessage,
          attemptCount: attempt.attemptNumber,
          ...(attempt.requestHeaders
            ? { requestHeaders: redactHeaders(attempt.requestHeaders) }
            : {}),
          nextAttemptAt: exhausted ? null : nextBackoff(attempt.attemptNumber),
          ...(exhausted ? { failedAt } : {}),
        },
      }),
      this.prisma.webhookEndpoint.update({
        where: { id: delivery.endpointId },
        data: { lastFailureAt: failedAt, lastFailureReason: attempt.errorMessage },
      }),
    ]);
  }
}

/// Exponential backoff with a ceiling: 1s, 2s, 4s, 8s, ... capped at 5
/// minutes. Capped because an endpoint that has been down for an hour is not
/// helped by waiting four more, and an uncapped doubling would push the last
/// attempt of a long retry chain days out.
function nextBackoff(attemptNumber: number): Date {
  const delayMs = Math.min(1_000 * 2 ** (attemptNumber - 1), 300_000);
  return new Date(Date.now() + delayMs);
}

/// The signature header is derived from the endpoint's secret. Storing it on
/// the delivery row would put a valid signature for a known body into a table
/// the UI renders — so it is dropped from the stored copy while remaining on
/// the wire.
function redactHeaders(headers: Record<string, string>): Record<string, string> {
  return { ...headers, "X-FlowERP-Signature": "[redacted]" };
}
