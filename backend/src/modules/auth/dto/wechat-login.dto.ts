import { Type } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';

class UserInfoDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nickname?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(512)
  avatar_url?: string;
}

/**
 * 微信登录请求体
 * 文档:03-API接口文档.md §2.1
 */
export class WechatLoginDto {
  @IsString()
  @MaxLength(128)
  code!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UserInfoDto)
  user_info?: UserInfoDto;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  privacy_version?: string;

  @IsOptional()
  @IsISO8601()
  agreed_at?: string;
}
