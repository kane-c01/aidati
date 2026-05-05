import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListAdminUsersQuery {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;

  @IsOptional()
  @IsIn(['1', '0', '-1', 'all'])
  status?: '1' | '0' | '-1' | 'all';

  @IsOptional()
  @IsIn(['user', 'admin', 'super_admin', 'all'])
  role?: 'user' | 'admin' | 'super_admin' | 'all';

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

export class BanUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** 0 永久 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  duration_days?: number;
}
