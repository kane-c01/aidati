import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, map } from 'rxjs';

import { ERROR_CODES } from '../constants/error-codes';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  request_id: string;
}

/**
 * 统一响应拦截器
 * 文档:开发文档/03-API接口文档.md §1.2
 *
 * 把 Controller 返回的原始数据包装为:
 *   { code: 0, message: 'ok', data: <原数据>, request_id }
 *
 * 同时:
 * - 把 BigInt 自动转成 string(避免 JS Number 精度丢失,见 §1.6)
 * - 已经是 ApiResponse 形态(含 code 字段)则不重复包裹(用于 202 异步等)
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string) ?? 'unknown';

    return next.handle().pipe(
      map((data) => {
        // 已经是规范响应直接返回(避免双重包裹)
        if (
          data !== null &&
          typeof data === 'object' &&
          'code' in (data as object) &&
          'data' in (data as object)
        ) {
          return data as unknown as ApiResponse<T>;
        }

        const safe = serializeBigInt(data);

        return {
          code: ERROR_CODES.SUCCESS,
          message: 'ok',
          data: safe as T,
          request_id: requestId,
        };
      }),
    );
  }
}

/**
 * 递归把 BigInt 转 string, 兼容 Prisma 自增主键
 */
export function serializeBigInt(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeBigInt);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeBigInt(v);
    }
    return out;
  }
  return value;
}
