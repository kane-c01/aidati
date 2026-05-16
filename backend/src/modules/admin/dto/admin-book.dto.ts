import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const COPYRIGHT_OPTIONS = ['public_domain', 'licensed', 'user_claimed', 'unknown'] as const;
type Copyright = (typeof COPYRIGHT_OPTIONS)[number];

class ChapterImportDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  order_no!: number;

  @IsString()
  @MaxLength(256)
  title!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  start_page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  end_page?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content_summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  content_full?: string;
}

export class CreateBookDto {
  @IsString()
  @MaxLength(256)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  isbn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(512)
  cover_url?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(512)
  pdf_url?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pdf_pages?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(COPYRIGHT_OPTIONS)
  copyright_status?: Copyright;
}

export class UpdateBookDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  isbn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(512)
  cover_url?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(512)
  pdf_url?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pdf_pages?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(COPYRIGHT_OPTIONS)
  copyright_status?: Copyright;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort_weight?: number;
}

export class ImportChaptersDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ChapterImportDto)
  chapters!: ChapterImportDto[];

  /** 导入前是否清空原章节 */
  @IsOptional()
  @IsIn([true, false])
  replace?: boolean;
}

export class ImportPdfDto {
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(512)
  pdf_url?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  max_chapters?: number;
}

export class CreateBookFromPhotoSetDto {
  @IsString()
  @Matches(/^\d+$/)
  photo_set_id!: string;

  @IsString()
  @MaxLength(256)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(512)
  cover_url?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(COPYRIGHT_OPTIONS)
  copyright_status?: Copyright;
}

export class ImportFromPhotoSetDto {
  @IsString()
  @Matches(/^\d+$/)
  photo_set_id!: string;
}

export class ListAdminBooksQuery {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;

  @IsOptional()
  @IsIn(['1', '0', '-1', 'all'])
  status?: '1' | '0' | '-1' | 'all';

  @IsOptional()
  @IsIn(['admin', 'user_upload', 'public_domain', 'all'])
  source?: 'admin' | 'user_upload' | 'public_domain' | 'all';

  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  created_by?: string;

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
