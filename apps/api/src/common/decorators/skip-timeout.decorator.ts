import { SetMetadata } from "@nestjs/common";

/// Marks a route handler as exempt from the global request timeout.
///
/// Use this for long-lived connections like Server-Sent Events (SSE), AI
/// streaming, or telematics live-stream endpoints that are intentionally
/// open for extended periods.
///
/// Example:
///   @Get("live-stream")
///   @SkipTimeout()
///   async liveStream(@Res() res: Response) { ... }
///
/// Without this decorator, the global REQUEST_TIMEOUT_MS applies and the
/// connection is terminated after 30 seconds (or the configured value).
export const SKIP_TIMEOUT_KEY = "skipTimeout";
export const SkipTimeout = () => SetMetadata(SKIP_TIMEOUT_KEY, true);
