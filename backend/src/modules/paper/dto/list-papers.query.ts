import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Max, Min } from 'class-validator';

const STATUS_KEYS = ['all', 'ready', 'submitted', 'graded'] as const;
export type PaperListStatus = (typeof STATUS_KEYS)[number];

/**
 * GET /v1/papers 分页 / 过滤参数
 */
export class ListPapersQuery {
  @IsOptional()
  @IsIn(STATUS_KEYS)
  status: PaperListStatus = 'all';

  @IsOptional()
  @IsString()
  @MaxLength(20)
  book_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  chapter_id?: string;

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
