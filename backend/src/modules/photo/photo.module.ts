import { Module } from '@nestjs/common';

import { PhotoController } from './photo.controller';
import { PhotoSetController } from './photo-set.controller';
import { PhotoService } from './photo.service';

/**
 * 拍照素材模块
 * - /v1/photos*               单图 CRUD
 * - /v1/photo-sets/:id/*      拍照集 reorder + OCR
 *
 * 依赖:PrismaService(全局)+ StorageService(全局)
 */
@Module({
  controllers: [PhotoController, PhotoSetController],
  providers: [PhotoService],
  exports: [PhotoService],
})
export class PhotoModule {}
