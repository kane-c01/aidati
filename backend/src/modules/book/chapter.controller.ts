import { Controller, Get, Param } from '@nestjs/common';

import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

import { BookService } from './book.service';

/**
 * 章节单查接口 — 用户侧
 *
 * 列表已经在 GET /v1/books/:id 返回, 这里仅暴露单个章节的详情(给出题前预览章节)
 */
@Controller('chapters')
export class ChapterController {
  constructor(private readonly bookService: BookService) {}

  @Get(':id')
  async detail(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.bookService.getChapterDetail(id);
  }
}
