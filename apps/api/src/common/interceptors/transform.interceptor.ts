import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { map, Observable } from "rxjs";
import { RAW_RESPONSE_KEY } from "../decorators/raw-response.decorator";

export interface SuccessResponse<T> {
  data: T;
}

/// Wraps every successful response in `{ data: ... }` so success and error
/// responses (see AllExceptionsFilter) share one consistent envelope shape.
///
/// A route marked @RawResponse() is passed through untouched — see that
/// decorator for why a file download must not be enveloped.
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, SuccessResponse<T> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<SuccessResponse<T> | T> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (raw) return next.handle();

    return next.handle().pipe(map((data) => ({ data })));
  }
}
