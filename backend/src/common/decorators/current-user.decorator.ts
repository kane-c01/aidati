import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

import type { JwtPayload } from '../types/auth.types';

/**
 * 在 Controller 中注入当前用户(从 JWT payload 解析)
 * 用法:
 *   @Get('me')
 *   getMe(@CurrentUser() user: JwtPayload) { ... }
 *
 *   @Get('me')
 *   getMyId(@CurrentUser('sub') userId: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (field: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
