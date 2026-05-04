import { IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @MaxLength(2048)
  refresh_token!: string;
}
