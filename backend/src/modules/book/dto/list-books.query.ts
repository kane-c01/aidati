import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';

export type BookSortKey = 'recommended' | 'latest' | 'hot';

const SORT_KEYS: BookSortKey[] = ['recommended', 'latest', 'hot'];

/**
 * GET /v1/books 列表参数
 * 文档:03-API §4.1
 */
export class ListBooksQuery {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @IsOptional()
  @IsIn(SORT_KEYS)
  sort: BookSortKey = 'recommended';

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
