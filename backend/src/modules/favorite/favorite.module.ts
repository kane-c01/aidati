import { Module } from '@nestjs/common';

import { FavoriteController } from './favorite.controller';
import { FavoriteService } from './favorite.service';

/**
 * 收藏模块
 *
 * 业务: 用户对书籍的收藏关系
 * 接口: §六-bis 收藏(独立路径, 不挤占 /books)
 *
 * Prisma 数据来自 PrismaModule, 全局可用。
 * Service 同时被 BookService 复用做 is_favorited 染色。
 */
@Module({
  controllers: [FavoriteController],
  providers: [FavoriteService],
  exports: [FavoriteService],
})
export class FavoriteModule {}
