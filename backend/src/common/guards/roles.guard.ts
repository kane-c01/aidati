import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ROLES_KEY } from '../decorators/roles.decorator';
import type { JwtPayload, UserRoleName } from '../types/auth.types';

/**
 * 角色守卫
 * 用法见 @Roles 装饰器
 * 必须在 JwtAuthGuard 之后执行(req.user 已注入)
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRoleName[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('未登录');

    const ok = requiredRoles.includes(user.role);
    if (!ok) {
      throw new ForbiddenException(
        `需要 [${requiredRoles.join(', ')}] 角色, 当前用户角色为 ${user.role}`,
      );
    }
    return true;
  }
}
