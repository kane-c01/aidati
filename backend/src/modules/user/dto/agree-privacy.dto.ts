import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * 用户重新同意隐私协议
 * 文档:03-API §3.3(虽然只有 GET /user/me/privacy, 但同意动作前端需要一个写入接口)
 */
export class AgreePrivacyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  version!: string;
}
