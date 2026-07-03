import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

/// Implemented as middleware rather than an interceptor: `res.on("finish")`
/// fires after the exception filter has already set the final status code,
/// so this always logs the status code the client actually received —
/// an interceptor's error-path `tap()` fires before the filter runs and
/// would log a stale/default status code on error responses.
@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HTTP");

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;
      this.logger.log(`${req.method} ${req.originalUrl} ${res.statusCode} +${duration}ms`);
    });

    next();
  }
}
