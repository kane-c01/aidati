import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';

/**
 * POST /v1/photo-sets/from-pdf
 * 拍照页统一入口:用户在「拍照」里选择本地 / 微信聊天记录里的 PDF
 * 后端拿 pdf_url → 调 ai-service 拆每页 PNG → 上传 OSS → 建 photo_set + 绑 photos
 *
 * 文档:03-API §5(拍照集)+ M8 PR2.6
 */
export class CreatePhotoSetFromPdfDto {
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(512)
  pdf_url!: string;

  /** 拍照集显示名(留空则用 PDF 文件名 / 时间戳) */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  /** 渲染上限(默认 50, 最大 50)。注意 PhotoSet 单集硬上限受 max_photo_pages 系统配置控制 */
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  max_pages?: number;
}
