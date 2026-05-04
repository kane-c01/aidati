/**
 * 鉴权层共享类型
 * JwtPayload 是 access_token 解码后的载荷, 与 token.service.ts 的签发格式一一对应
 */

export type UserRoleName = 'user' | 'admin' | 'super_admin';

export interface JwtPayload {
  /** 用户 id (BigInt 字符串化) */
  sub: string;
  /** 微信 openid (脱敏后) */
  openid: string;
  /** 角色 */
  role: UserRoleName;
  /** Token JTI (用于撤销) */
  jti: string;
  /** Token 类型 */
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}
