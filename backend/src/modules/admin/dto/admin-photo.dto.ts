import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PhotoRegionDto } from '../../photo/dto/update-photo.dto';

const OCR_STATUS = ['pending', 'processing', 'done', 'failed'] as const;
type OcrStatusStr = (typeof OCR_STATUS)[number];

/**
 * GET /v1/admin/photo-sets
 */
export class ListAdminPhotoSetsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  user_id?: string;

  @IsOptional()
  @IsIn([...OCR_STATUS, 'all'])
  ocr_status?: OcrStatusStr | 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  page_size: number = 20;
}

/**
 * PATCH /v1/admin/photos/:id —— 管理员二次校对
 */
export class AdminUpdatePhotoDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  ocr_text?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  order_no?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PhotoRegionDto)
  regions?: PhotoRegionDto[];
}
