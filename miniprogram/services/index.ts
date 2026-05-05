/**
 * 业务服务统一出口
 *
 * 调用方:
 *   import { authService, paperService } from '@/services';
 */

export { authService } from './auth';
export { bookService } from './book';
export { mistakeService } from './mistake';
export { paperService } from './paper';
export { photoService } from './photo';
export { uploadService } from './upload';
export { userService } from './user';
export {
  ContentBlockedError,
  HttpError,
  NetworkError,
  QuotaExceededError,
  RateLimitError,
  TokenExpiredError,
  bindTokenAccessor,
  http,
  uploadToOss,
} from './http';
