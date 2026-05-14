import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export type PaperSourceTypeStr = 'book' | 'chapter' | 'photo_set';
export type DifficultyStr = 'easy' | 'medium' | 'hard';
export type QuestionTypeStr = 'single' | 'multiple' | 'judge' | 'fill' | 'short_answer';

const ALLOWED_SOURCE: PaperSourceTypeStr[] = ['book', 'chapter', 'photo_set'];
const ALLOWED_TYPES: QuestionTypeStr[] = ['single', 'multiple', 'judge', 'fill', 'short_answer'];
const ALLOWED_DIFFICULTY: DifficultyStr[] = ['easy', 'medium', 'hard'];

class GenerateConfigDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'question_types 至少选一种' })
  @ArrayMaxSize(5)
  @IsIn(ALLOWED_TYPES, { each: true })
  question_types!: QuestionTypeStr[];

  @IsIn(ALLOWED_DIFFICULTY)
  difficulty: DifficultyStr = 'medium';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50, { message: '单卷最多 50 题' })
  count!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  custom_prompt?: string;
}

/**
 * POST /v1/papers — 创建试卷
 * 文档:03-API §7.1
 */
export class CreatePaperDto {
  @IsString()
  @IsIn(ALLOWED_SOURCE)
  source_type!: PaperSourceTypeStr;

  // book / chapter 模式必填
  @ValidateIf((o: CreatePaperDto) => o.source_type === 'book' || o.source_type === 'chapter')
  @IsString()
  @Matches(/^\d+$/, { message: 'book_id 必须是数字字符串' })
  book_id?: string;

  // chapter 模式必填(允许多章)
  @ValidateIf((o: CreatePaperDto) => o.source_type === 'chapter')
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Matches(/^\d+$/, { each: true, message: 'chapter_id 必须是数字字符串' })
  chapter_ids?: string[];

  // photo_set 模式必填
  @ValidateIf((o: CreatePaperDto) => o.source_type === 'photo_set')
  @IsString()
  @Matches(/^\d+$/, { message: 'photo_set_id 必须是数字字符串' })
  photo_set_id?: string;

  /**
   * photo_set 模式可选: 仅以列出的 photo_id 计入出题文本
   * - 缺省/空: 走原逻辑(全用 photo_set.ocrText)
   * - 非空: 后端按 id 过滤 photos 后按 order_no 重新拼接
   * 上限 20(单次拍照集最多 20 页)
   */
  @ValidateIf((o: CreatePaperDto) => o.source_type === 'photo_set')
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Matches(/^\d+$/, { each: true, message: 'selected_photo_ids 元素必须是数字字符串' })
  selected_photo_ids?: string[];

  @ValidateNested()
  @Type(() => GenerateConfigDto)
  config!: GenerateConfigDto;
}
