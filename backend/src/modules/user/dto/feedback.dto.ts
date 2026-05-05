import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/**
 * 用户反馈 DTO
 * 文档:03-API §3.4
 */
export class FeedbackDto {
  @IsString()
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  contact?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsUrl({ require_protocol: true, require_tld: false }, { each: true })
  screenshots?: string[];
}
