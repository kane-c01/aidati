import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { nanoid } from 'nanoid';

/**
 * 请求 ID 中间件
 * 文档:开发文档/03-API接口文档.md §1.1
 *
 * - 客户端可在 Header `X-Request-Id` 透传;若无则后端自动生成
 * - 写入 req.headers 供后续过滤器/拦截器使用
 * - 写入 Response Header 便于前端日志关联
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    let requestId = req.headers['x-request-id'] as string | undefined;
    if (!requestId) {
      requestId = nanoid(16);
      req.headers['x-request-id'] = requestId;
    }
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
