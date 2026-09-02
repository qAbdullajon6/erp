import { Injectable, Logger } from "@nestjs/common";
import type { Response } from "express";

export interface SupportRealtimeEvent {
  type: "support.message.created";
  ticketId: string;
  message: {
    id: string;
    ticketId: string;
    /// authorId is deliberately omitted to avoid leaking staff identity.
    isStaff: boolean;
    body: string;
    createdAt: string;
    author: { firstName: string; lastName: string; email: string } | null;
  };
}

interface ClientContext {
  organizationId: string;
  userId: string;
}

/// SSE registry for support ticket realtime events.
///
/// Mirrors the pattern established by TelematicsRealtimeService:
///   1. A Map<Response, ClientContext> tracks authenticated connected clients.
///   2. publish() fans out only to clients whose org matches the event's org —
///      tenant isolation is structural, never trust a client-supplied org.
///   3. Disconnected responses are cleaned up proactively on fan-out failure
///      and reactively via the 'close' event in openSupportSseStream().
///
/// Single-instance in-process fan-out only (no Redis). Support events are
/// low-frequency manual actions — horizontal scale can be added when needed.
@Injectable()
export class SupportRealtimeService {
  private readonly logger = new Logger(SupportRealtimeService.name);
  private readonly clients = new Map<Response, ClientContext>();

  /// Per-org admission limit. Keeps one org from consuming all SSE slots.
  private readonly maxPerOrg = 50;
  /// Global process ceiling.
  private readonly maxGlobal = 2000;

  /// Returns false when admission control would exceed a limit; caller must
  /// reject with HTTP 429 without opening a stream.
  tryRegisterClient(res: Response, context: ClientContext): boolean {
    if (this.clients.size >= this.maxGlobal) return false;
    const orgCount = this.orgClientCount(context.organizationId);
    if (orgCount >= this.maxPerOrg) return false;
    this.clients.set(res, context);
    return true;
  }

  removeClient(res: Response): void {
    this.clients.delete(res);
  }

  clientCount(): number {
    return this.clients.size;
  }

  orgClientCount(organizationId: string): number {
    let n = 0;
    for (const ctx of this.clients.values()) {
      if (ctx.organizationId === organizationId) n++;
    }
    return n;
  }

  /// Publish a support event to every authenticated client of the org.
  /// Any delivery failure drops only that client — others are unaffected.
  publish(organizationId: string, event: SupportRealtimeEvent): void {
    const sseData = `data: ${JSON.stringify(event)}\n\n`;
    for (const [res, ctx] of this.clients) {
      if (ctx.organizationId !== organizationId) continue;
      if (res.writableEnded) {
        this.clients.delete(res);
        continue;
      }
      try {
        res.write(sseData);
      } catch (err) {
        this.logger.warn(
          `Failed to deliver support SSE event, dropping client: ${err instanceof Error ? err.message : err}`,
        );
        this.clients.delete(res);
      }
    }
  }
}
