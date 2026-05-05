import { Module } from '@nestjs/common';

import { BookController } from './book.controller';
import { BookService } from './book.service';
import { ChapterController } from './chapter.controller';

/**
 * 书籍 / 章节模块(用户侧)
 *
 * MVP:GET /v1/books, GET /v1/books/:id, GET /v1/chapters/:id
 * V2 :收藏 / 用户上传 / ISBN 扫码搜索 / 全文搜索
 *
 * 管理员侧的 CRUD 由 admin 模块单独承担(M7)
 */
@Module({
  controllers: [BookController, ChapterController],
  providers: [BookService],
  exports: [BookService],
})
export class BookModule {}
