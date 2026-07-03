import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

interface ErrorBody {
  error: {
    statusCode: number;
    message: string;
    details?: unknown;
  };
}

/// Catches every exception (HttpException or otherwise) and formats it into
/// one consistent JSON error shape, so API consumers never have to handle
/// more than one error response format.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException ? exception.getResponse() : null;
    const message =
      typeof exceptionResponse === "string"
        ? exceptionResponse
        : ((exceptionResponse as { message?: string | string[] })?.message ??
          (exception instanceof Error ? exception.message : "Internal server error"));

    const body: ErrorBody = {
      error: {
        statusCode,
        message: Array.isArray(message) ? message.join(", ") : message,
      },
    };

    if (
      typeof exceptionResponse === "object" &&
      exceptionResponse !== null &&
      "message" in exceptionResponse &&
      Array.isArray((exceptionResponse as { message?: unknown }).message)
    ) {
      body.error.details = (exceptionResponse as { message: string[] }).message;
    }

    if (!isHttpException) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json(body);
  }
}
