import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/**
 * PATCH /v1/photos/{id}  — 重拍 / 替换图
 * 文档:03-API §5.4
 */
export class UpdatePhotoDto {
  @IsOptional()
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(512)
  image_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ocr_text?: string;
}
