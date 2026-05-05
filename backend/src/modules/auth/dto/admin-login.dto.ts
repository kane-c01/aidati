import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * 后台账号密码登录
 * 文档:03-API §2.x(扩展, dev / 内部管理员通道)
 *
 * 仅限 admin / super_admin;普通用户走 /auth/wechat-login
 */
export class AdminLoginDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  username!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}

/**
 * super_admin 修改 / 重置某个 admin 账号的用户名/密码
 */
export class SetAdminCredentialDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  username!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}
