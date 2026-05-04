import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UnauthorizedBusinessException } from '../exceptions/business.exception';

/**
 * JWT 认证守卫
 * 默认全局启用; @Public() 标注的接口跳过
 *
 * 失败统一抛 UnauthorizedBusinessException → 走 03-API §1.3 的 20001 错误码
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context) as boolean | Promise<boolean>;
  }

  override handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw new UnauthorizedBusinessException(
        err instanceof Error ? err.message : '登录已过期或无效',
      );
    }
    return user;
  }
}
