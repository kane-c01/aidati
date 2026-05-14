import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Photo.regions 单条结构
 * - bbox: [x, y, w, h], 默认归一化(0~1)
 * - kind: 框选目的, 决定后续走 OCR 还是图表识别
 */
export class PhotoRegionDto {
  @IsString()
  @MaxLength(64)
  id!: string;

  @IsArray()
  @IsNumber({ allowNaN: false, allowInfinity: false }, { each: true })
  @ArrayMaxSize(4)
  bbox!: [number, number, number, number];

  @IsOptional()
  @IsIn(['normalized', 'pixel'])
  coord?: 'normalized' | 'pixel';

  @IsIn(['text', 'chart', 'formula', 'table'])
  kind!: 'text' | 'chart' | 'formula' | 'table';

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  ocr_text?: string;

  @IsOptional()
  @IsObject()
  chart_data?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  corrected?: number;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  note?: string;
}

/**
 * PATCH /v1/photos/{id}  — 重拍 / 替换图 / 框选区域回写
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

  /**
   * 框选区域整体替换(传 [] 表示清空)
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PhotoRegionDto)
  regions?: PhotoRegionDto[];
}
