import type { Response } from "express";
import type { TelematicsRealtimeService } from "./telematics-realtime.service";

export interface OpenSseStreamOptions {
  organizationId: string;
  vehicleIds?: Set<string>;
  /// Human-facing message when admission control rejects the client.
  tooManyMessage?: string;
}

/// Opens an SSE telematics/tracking stream with admission control, keep-alive,
/// and cleanup. Shared by `/telematics/live-stream` and `/tracking/live-stream`
/// so both surfaces share one realtime registry.
export function openTelematicsSseStream(
  realtime: TelematicsRealtimeService,
  res: Response,
  options: OpenSseStreamOptions,
): boolean {
  const admitted = realtime.tryRegisterClient(res, {
    organizationId: options.organizationId,
    vehicleIds: options.vehicleIds,
  });
  if (!admitted) {
    res.setHeader("Retry-After", "30");
    res.status(429).json({
      statusCode: 429,
      message:
        options.tooManyMessage ??
        "Too many active telematics streams. Please retry shortly.",
    });
    return false;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.on("close", () => {
    realtime.removeClient(res);
  });

  const keepAliveInterval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(": keep-alive\n\n");
    } else {
      clearInterval(keepAliveInterval);
    }
  }, 30_000);

  res.on("close", () => {
    clearInterval(keepAliveInterval);
  });

  return true;
}
