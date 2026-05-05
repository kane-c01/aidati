import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class ReorderItem {
  @IsString()
  @Matches(/^\d+$/, { message: 'id 必须是数字字符串' })
  id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  order_no!: number;
}

/**
 * PATCH /v1/photo-sets/{id}/reorder
 * 文档:03-API §5.4
 */
export class ReorderPhotosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReorderItem)
  items!: ReorderItem[];
}
