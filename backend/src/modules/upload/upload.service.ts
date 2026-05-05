import { Injectable, Logger } from '@nestjs/common';

import { BusinessException } from '../../common/exceptions/business.exception';
import { ERROR_CODES } from '../../common/constants/error-codes';
import {
  StorageService,
  type UploadPolicy,
  type UploadScene,
} from '../../infra/storage/storage.service';

/** 不带 content_type 时按 scene 推断默认 MIME */
const SCENE_DEFAULT_MIME: Record<UploadScene, string> = {
  photo: 'image/jpeg',
  cover: 'image/jpeg',
  pdf: 'application/pdf',
};

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(private readonly storage: StorageService) {}

  /**
   * 申请直传凭证 — 03-API §5.1
   */
  async getPolicy(userId: bigint, scene: UploadScene, contentType?: string): Promise<UploadPolicy> {
    const ct = contentType ?? SCENE_DEFAULT_MIME[scene];
    try {
      return await this.storage.presignPut(scene, userId, ct);
    } catch (err) {
      this.logger.warn(
        `presignPut 失败 user=${userId} scene=${scene} err=${(err as Error).message}`,
      );
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, (err as Error).message);
    }
  }

  /**
   * 简单上传(后端转存) — 03-API §5.3
   * 适合 < 1MB 的小文件;大文件请走直传
   */
  async simpleUpload(
    userId: bigint,
    scene: UploadScene,
    body: Buffer,
    contentType: string,
  ): Promise<{ key: string; url: string }> {
    try {
      return await this.storage.putObject(scene, userId, body, contentType);
    } catch (err) {
      this.logger.error(`simpleUpload 失败 user=${userId}`, err as Error);
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, (err as Error).message);
    }
  }
}
