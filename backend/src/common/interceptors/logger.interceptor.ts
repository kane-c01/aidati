import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

import { maskToken } from '../utils/mask';

/**
 * 请求日志拦截器
 * 文档:开发文档/05-部署运维与安全.md §6.2
 *
 * 输出字段:method / url / status / duration / request_id / user_id
 * 敏感字段(authorization)会被 mask
 */
@Injectable()
export class LoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const method = req.method;
    const url = req.originalUrl ?? req.url;
    const requestId = (req.headers['x-request-id'] as string) ?? '-';
    const userId = (req as Request & { user?: { sub?: string } }).user?.sub ?? '-';
    const auth = req.headers.authorization;
    const maskedAuth = auth ? maskToken(auth) : '-';

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          this.logger.log(
            `${method} ${url} → ${res.statusCode} ${duration}ms rid=${requestId} uid=${userId} auth=${maskedAuth}`,
          );
        },
        error: (err: Error) => {
          const duration = Date.now() - start;
          this.logger.warn(
            `${method} ${url} → ERROR ${duration}ms rid=${requestId} uid=${userId} msg="${err.message}"`,
          );
        },
      }),
    );
  }
}
