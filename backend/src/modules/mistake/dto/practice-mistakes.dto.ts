import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

/**
 * POST /v1/mistakes/practice — 错题重做生成临时试卷
 * 文档:03-API §8.3
 *
 * 二选一:
 *   - mistake_ids:精选若干错题
 *   - include_book_id:把该书全部 active 错题打包
 */
export class PracticeMistakesDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Matches(/^\d+$/, { each: true, message: 'mistake_ids 必须全部是数字字符串' })
  mistake_ids?: string[];

  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: 'include_book_id 必须是数字字符串' })
  include_book_id?: string;

  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
