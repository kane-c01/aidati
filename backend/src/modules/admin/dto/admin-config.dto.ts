import { Type } from 'class-transformer';
import { Allow, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateConfigDto {
  /** 任意 JSON 值, 由 super_admin 自行负责语义 */
  @Allow()
  value!: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  description?: string;
}

export class ListAuditsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  scene?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  result?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  user_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size: number = 20;
}
