import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 标注接口为「公开」, 跳过 JwtAuthGuard
 * 默认全局守卫为认证, 需要公开接口时显式标注
 * 用法:
 *   @Public()
 *   @Post('login')
 *   login() {}
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
