import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * POST /v1/books/upload —— 用户上传 PDF 自建书
 */
export class UploadUserBookDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(512)
  cover_url?: string;

  @IsString()
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(512)
  pdf_url!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  max_chapters?: number;
}

/**
 * PATCH /v1/books/:id —— 用户改自己的书
 */
export class PatchUserBookDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cover_url?: string;
}

/**
 * POST /v1/books/from-photo-set —— 拍照集 → 一本书
 */
export class CreateBookFromPhotoSetDto {
  @IsString()
  @MaxLength(120)
  photo_set_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(512)
  cover_url?: string;
}

/**
 * GET /v1/books/mine
 */
export class ListMyBooksQuery {
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
