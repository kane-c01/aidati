import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import type { UploadScene } from '../../../infra/storage/storage.service';

const ALLOWED_SCENES: UploadScene[] = ['photo', 'cover', 'pdf'];

/**
 * GET /v1/upload/policy?scene=photo&content_type=image/jpeg
 *
 * scene 决定上传白名单 + OSS 目录;content_type 决定后缀, 缺省按 scene 推断
 */
export class UploadPolicyQuery {
  @IsString()
  @IsIn(ALLOWED_SCENES, { message: 'scene 只允许 photo / cover / pdf' })
  scene!: UploadScene;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[\w-]+\/[\w.+-]+$/, { message: 'content_type 必须是合法 MIME' })
  content_type?: string;
}
