import { IsString, MaxLength } from 'class-validator';

/**
 * POST /v1/favorites 请求体
 */
export class AddFavoriteDto {
  @IsString()
  @MaxLength(20)
  book_id!: string;
}
