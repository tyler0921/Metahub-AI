import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, finalize } from 'rxjs';

/**
 * 요청 1건당 한 줄만 남깁니다.
 *
 * `tap()` 을 쓰면 SSE 스트림에서 **이벤트가 나갈 때마다** 로그가 찍힙니다.
 * (세션 하나에 수십 줄이 쌓여 마치 연결이 여러 번 열린 것처럼 보입니다)
 * `finalize()` 는 스트림이 끝나거나 끊길 때 딱 한 번만 실행되므로,
 * 일반 요청과 SSE 모두 "요청 1건 = 로그 1줄"이 됩니다.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const started = Date.now();

    return next.handle().pipe(
      finalize(() => {
        const elapsed = Date.now() - started;
        this.logger.log(`${req.method} ${req.originalUrl} ${elapsed}ms`);
      }),
    );
  }
}
