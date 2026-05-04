import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
