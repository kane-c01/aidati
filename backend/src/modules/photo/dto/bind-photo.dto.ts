import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min } from 'class-validator';

/**
 * 直传完成后绑定 photo
 * 文档:03-API §5.2
 */
export class BindPhotoDto {
  /** photo_set_id 为空时自动新建一个拍照集 */
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: 'photo_set_id 必须是数字字符串' })
  photo_set_id?: string;

  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(512)
  image_url!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  order_no!: number;

  /** 第一次创建拍照集时可以同时给一个名字 */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;
}
