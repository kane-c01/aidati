import { Module } from '@nestjs/common';

import { ModerationModule } from '../moderation/moderation.module';

import { PhotoController } from './photo.controller';
import { PhotoSetController } from './photo-set.controller';
import { PhotoService } from './photo.service';

/**
 * 拍照素材模块
 * - /v1/photos*               单图 CRUD
 * - /v1/photo-sets/:id/*      拍照集 reorder + OCR
 *
 * 依赖:PrismaService(全局)+ StorageService(全局)+ ModerationService(校对/区域文本审核)
 */
@Module({
  imports: [ModerationModule],
  controllers: [PhotoController, PhotoSetController],
  providers: [PhotoService],
  exports: [PhotoService],
})
export class PhotoModule {}
