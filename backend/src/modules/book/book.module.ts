import { Module } from '@nestjs/common';

import { FavoriteModule } from '../favorite/favorite.module';
import { PhotoModule } from '../photo/photo.module';

import { BookController } from './book.controller';
import { BookService } from './book.service';
import { ChapterController } from './chapter.controller';

/**
 * 书籍 / 章节模块(用户侧)
 *
 * MVP:GET /v1/books, GET /v1/books/:id, GET /v1/chapters/:id
 * M9 :收藏(独立 favorite 模块, 这里 import 进来给 BookService 染色 is_favorited)
 * M8 PR2.6:依赖 PhotoModule 的 PhotoService.createSetFromPdf, 用于"自建书 PDF 双写到 photo_set"
 *
 * 管理员侧的 CRUD 由 admin 模块单独承担(M7)
 *
 * 历史上曾有 /v1/categories(分类管理), 已在 2026-05-07 下线 ——
 * 小程序定位为考证学习, 改用「推荐 + 标签 + 全文搜索」, 无需树形分类。
 */
@Module({
  imports: [FavoriteModule, PhotoModule],
  controllers: [BookController, ChapterController],
  providers: [BookService],
  exports: [BookService],
})
export class BookModule {}
