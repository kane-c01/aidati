import { HttpException, HttpStatus } from '@nestjs/common';

import { ERROR_CODES, ERROR_MESSAGES, type ErrorCode } from '../constants/error-codes';

/**
 * 业务异常
 * 用法:`throw new BusinessException(ERROR_CODES.QUOTA_EXCEEDED)`
 *
 * 所有业务错误统一通过本异常抛出, 由 AllExceptionsFilter 转为 03-API §1.2 规范的响应
 */
export class BusinessException extends HttpException {
  /** 业务错误码(`code` 字段) */
  public readonly bizCode: number;

  constructor(
    bizCode: ErrorCode,
    message?: string,
    httpStatus: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(message ?? ERROR_MESSAGES[bizCode] ?? '业务异常', httpStatus);
    this.bizCode = bizCode;
  }
}

/** 鉴权异常 → 401 */
export class UnauthorizedBusinessException extends BusinessException {
  constructor(message?: string) {
    super(ERROR_CODES.TOKEN_INVALID, message, HttpStatus.UNAUTHORIZED);
  }
}

/** 资源不存在 → 404 */
export class NotFoundBusinessException extends BusinessException {
  constructor(message = '资源不存在') {
    super(ERROR_CODES.RESOURCE_NOT_FOUND, message, HttpStatus.NOT_FOUND);
  }
}

/** 内容安全拦截 → 422 */
export class ContentBlockedException extends BusinessException {
  constructor(message?: string, severe = false) {
    super(
      severe ? ERROR_CODES.CONTENT_ILLEGAL : ERROR_CODES.CONTENT_SENSITIVE,
      message,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** 限流 → 429 */
export class RateLimitedBusinessException extends BusinessException {
  constructor(message?: string) {
    super(ERROR_CODES.RATE_LIMITED, message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

/** 配额耗尽 → 429 */
export class QuotaExceededException extends BusinessException {
  constructor(message?: string) {
    super(ERROR_CODES.QUOTA_EXCEEDED, message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
