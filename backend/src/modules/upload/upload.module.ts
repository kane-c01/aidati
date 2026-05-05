import { Module } from '@nestjs/common';

import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

/**
 * 上传中心模块
 * - GET /v1/upload/policy   预签直传(推荐)
 * - POST /v1/upload         multipart 后端转存(兜底)
 *
 * 依赖 StorageService(全局, 不需 import)
 */
@Module({
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
