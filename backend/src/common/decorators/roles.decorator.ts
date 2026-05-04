import { SetMetadata } from '@nestjs/common';

import type { UserRoleName } from '../types/auth.types';

export const ROLES_KEY = 'roles';

/**
 * 标注接口需要的角色
 * 用法:`@Roles('admin', 'super_admin')`
 *
 * 角色守卫(RolesGuard)会读取本元数据 + 校验 JWT payload.role
 */
export const Roles = (...roles: UserRoleName[]) => SetMetadata(ROLES_KEY, roles);
