import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { ERROR_CODES, ERROR_MESSAGES } from '../constants/error-codes';
import { BusinessException } from '../exceptions/business.exception';

/**
 * 全局异常过滤器
 * 文档:开发文档/03-API接口文档.md §1.2 / §1.3
 *
 * 统一把异常转成:
 *   { code, message, data: null, request_id }
 *
 * 优先级:
 * 1. BusinessException → 用其 bizCode + httpStatus
 * 2. HttpException → 默认映射 HTTP code 到 ERROR_CODES
 * 3. 其它(未知错误)→ 500 + DB_ERROR + 写 error 日志
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = (request.headers['x-request-id'] as string) ?? 'unknown';

    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let bizCode: number = ERROR_CODES.DB_ERROR;
    let message = ERROR_MESSAGES[ERROR_CODES.DB_ERROR];

    if (exception instanceof BusinessException) {
      httpStatus = exception.getStatus();
      bizCode = exception.bizCode;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      bizCode = this.mapHttpStatusToBizCode(httpStatus);
      const res = exception.getResponse();
      // 4xx 类异常透传 framework 文案;5xx 类隐藏内部细节
      if (httpStatus < 500) {
        message = this.extractMessage(res);
      } else {
        const fallback = ERROR_MESSAGES[bizCode] ?? ERROR_MESSAGES[ERROR_CODES.DB_ERROR];
        message = fallback;
        this.logger.error(
          `${request.method} ${request.url} → ${httpStatus} ` +
            `internal=${this.extractMessage(res)}`,
          exception.stack,
        );
      }
    } else if (exception instanceof Error) {
      // 5xx 未知异常: 给前端泛化文案, 详细错误仅入日志, 防止 SQL/表名/堆栈泄露
      message = ERROR_MESSAGES[ERROR_CODES.DB_ERROR];
      this.logger.error(
        `${request.method} ${request.url} - ${exception.message}`,
        exception.stack,
      );
    }

    if (httpStatus >= 400 && httpStatus < 500 && exception instanceof BusinessException) {
      // 业务侧可预期的 4xx, 仅 warn 级
      this.logger.warn(
        `${request.method} ${request.url} → ${httpStatus} biz=${bizCode} msg="${message}"`,
      );
    }

    response.status(httpStatus).json({
      code: bizCode,
      message,
      data: null,
      request_id: requestId,
    });
  }

  private mapHttpStatusToBizCode(status: number): number {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ERROR_CODES.PARAM_INVALID;
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.TOKEN_INVALID;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.PERMISSION_DENIED;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.RESOURCE_NOT_FOUND;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.RATE_LIMITED;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ERROR_CODES.CONTENT_SENSITIVE;
      default:
        return ERROR_CODES.DB_ERROR;
    }
  }

  private extractMessage(res: string | object): string {
    if (typeof res === 'string') return res;
    if (typeof res === 'object' && res !== null) {
      const r = res as { message?: string | string[] };
      if (Array.isArray(r.message)) return r.message.join('; ');
      if (typeof r.message === 'string') return r.message;
    }
    return '未知错误';
  }
}
