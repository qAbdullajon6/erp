import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, Observable } from "rxjs";

export interface SuccessResponse<T> {
  data: T;
}

/// Wraps every successful response in `{ data: ... }` so success and error
/// responses (see AllExceptionsFilter) share one consistent envelope shape.
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, SuccessResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<SuccessResponse<T>> {
    return next.handle().pipe(map((data) => ({ data })));
  }
}
