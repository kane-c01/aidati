import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

import { AnswerItemDto } from './save-draft.dto';

/**
 * POST /v1/papers/{id}/submit — 提交答卷
 * 文档:03-API §7.6
 */
export class SubmitAnswersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AnswerItemDto)
  answers!: AnswerItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  total_time_sec?: number;
}
