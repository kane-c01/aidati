import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class OcrItem {
  @IsString()
  @Matches(/^\d+$/, { message: 'photo_id 必须是数字字符串' })
  photo_id!: string;

  @IsString()
  @MaxLength(20000, { message: 'ocr_text 单图不超过 2 万字符' })
  ocr_text!: string;
}

/**
 * PATCH /v1/photo-sets/{id}/ocr
 * 用于:
 * - 客户端微信 OCR 完成后批量回写每张图的识别结果(03-API §6.1+6.2 主路径)
 * - 用户在校对页修改文本(03-API §6.3)
 */
export class UpdateOcrDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OcrItem)
  items!: OcrItem[];
}
