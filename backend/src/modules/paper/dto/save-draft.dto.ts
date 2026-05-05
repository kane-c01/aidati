import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class AnswerItemDto {
  @IsString()
  @Matches(/^\d+$/, { message: 'question_id 必须是数字字符串' })
  question_id!: string;

  /**
   * 答案体, 形态因题型而异:
   *   single  → ["A"]
   *   multiple → ["A","B"]
   *   judge   → true / false
   *   fill    → "答案文本"
   *   short_answer → "我的简答..."
   * 由 PaperService 内的 grader 按题型校验
   *
   * 注:必须用 @Allow() 否则 ValidationPipe(whitelist=true) 会把它剥掉
   */
  @Allow()
  user_answer!: unknown;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  time_spent_sec?: number;
}

/**
 * POST /v1/papers/{id}/draft — 暂存进度(7 天)
 * 文档:03-API §7.4
 */
export class SaveDraftDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AnswerItemDto)
  answers!: AnswerItemDto[];
}
