import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

import { MistakeStatus } from '@prisma/client';

export class ListMistakesQuery {
  /** active 默认显示 */
  @IsOptional()
  @IsIn(['active', 'mastered', 'manual_mastered', 'all'])
  status?: 'active' | 'mastered' | 'manual_mastered' | 'all';

  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: 'book_id 必须是数字字符串' })
  book_id?: string;

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

export const STATUS_FILTER_MAP: Record<string, MistakeStatus[] | undefined> = {
  active: [MistakeStatus.active],
  mastered: [MistakeStatus.mastered, MistakeStatus.manual_mastered],
  manual_mastered: [MistakeStatus.manual_mastered],
  all: undefined,
};
