import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/**
 * 更新个人资料 DTO
 * 文档:03-API §3.2
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nickname?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(512)
  avatar_url?: string;
}
