import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { Observable, throwError, TimeoutError } from "rxjs";
import { catchError, timeout } from "rxjs/operators";
import { SKIP_TIMEOUT_KEY } from "../decorators/skip-timeout.decorator";
import type { AppConfig } from "../../config/configuration";

/// Global request timeout interceptor. Enforces a maximum request duration
/// to prevent slow queries or hanging operations from blocking workers.
///
/// SSE endpoints (marked with @SkipTimeout()) are exempt. These are long-lived
/// by design: AI streaming (/ai/conversations/:id/chat) and telematics live
/// streams (/telematics/live-stream) remain open indefinitely.
///
/// For regular HTTP requests, if the response doesn't complete within
/// REQUEST_TIMEOUT_MS (default 30s), the interceptor throws RequestTimeoutException
/// (408 Request Timeout), freeing the worker for other requests.
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TimeoutInterceptor.name);
  private readonly timeoutMs: number;

  constructor(
    private readonly reflector: Reflector,
    configService: ConfigService,
  ) {
    const appConfig = configService.get<AppConfig>("app")!;
    this.timeoutMs = appConfig.requestTimeoutMs;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Check if the handler is marked with @SkipTimeout()
    const skipTimeout = this.reflector.getAllAndOverride<boolean>(SKIP_TIMEOUT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipTimeout) {
      // SSE or other long-lived endpoint; no timeout applied
      return next.handle();
    }

    // Apply timeout to regular HTTP requests
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          const request = context.switchToHttp().getRequest();
          this.logger.warn(
            `Request timeout (${this.timeoutMs}ms exceeded): ${request.method} ${request.url}`,
          );
          return throwError(() => new RequestTimeoutException("Request processing exceeded timeout"));
        }
        return throwError(() => err);
      }),
    );
  }
}
