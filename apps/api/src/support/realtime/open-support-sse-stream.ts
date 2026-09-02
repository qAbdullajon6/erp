import type { Response } from "express";
import type { SupportRealtimeService } from "./support-realtime.service";

/// Opens an authenticated SSE support stream with admission control,
/// keep-alive heartbeats, and cleanup on close.
///
/// Returns false and writes HTTP 429 when admission control rejects the client.
/// The caller must return immediately without further writes in that case.
export function openSupportSseStream(
  realtime: SupportRealtimeService,
  res: Response,
  context: { organizationId: string; userId: string },
): boolean {
  const admitted = realtime.tryRegisterClient(res, context);
  if (!admitted) {
    res.setHeader("Retry-After", "30");
    res.status(429).json({
      statusCode: 429,
      message: "Too many active support streams. Please retry shortly.",
    });
    return false;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Prevent Nginx from buffering the stream.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Remove from registry when the browser closes the tab.
  res.on("close", () => {
    realtime.removeClient(res);
    clearInterval(keepAliveInterval);
  });

  // Send a comment-frame every 30 s to keep proxies from killing idle connections.
  const keepAliveInterval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(": keep-alive\n\n");
    } else {
      clearInterval(keepAliveInterval);
    }
  }, 30_000);

  return true;
}
