import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export interface ErrorResponseBody {
  statusCode: number;
  message: string;
  path: string;
  timestamp: string;
}

/** 모든 예외를 일관된 JSON 형태로 변환합니다. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = this.resolveMessage(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // SSE 스트림이 이미 시작된 경우엔 헤더를 다시 쓸 수 없다
    if (response.headersSent) {
      response.end();
      return;
    }

    const body: ErrorResponseBody = {
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };
    response.status(status).json(body);
  }

  private resolveMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') return res;
      if (typeof res === 'object' && res !== null && 'message' in res) {
        const m = (res as { message: unknown }).message;
        return Array.isArray(m) ? m.join(', ') : String(m);
      }
      return exception.message;
    }
    if (exception instanceof Error) return exception.message;
    return '알 수 없는 오류가 발생했습니다.';
  }
}
