import { IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/**
 * 更新个人资料 DTO
 * 文档:03-API §3.2
 *
 * 注意 is_minor 设计:
 * - 一旦设为 1 不可通过本接口改回 0(PRD §7.5.2)
 * - 改回 0 需走客服通道(M2+ 由管理员后台操作)
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

  @IsOptional()
  @IsIn([0, 1])
  is_minor?: 0 | 1;

  @IsOptional()
  @IsIn([0, 1])
  minor_mode_enabled?: 0 | 1;
}
