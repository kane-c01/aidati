import { Controller, Get, Param } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { JwtPayload } from '../../common/types/auth.types';

import { BookService } from './book.service';

/**
 * 章节单查接口 — 用户侧
 *
 * - GET /v1/chapters/:id        章节简要(出题前预览)
 * - GET /v1/chapters/:id/full   章节正文(在线阅读用)
 */
@Controller('chapters')
export class ChapterController {
  constructor(private readonly bookService: BookService) {}

  @Get(':id')
  async detail(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.bookService.getChapterDetail(id, BigInt(user.sub));
  }

  @Get(':id/full')
  async full(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.bookService.getChapterFull(id, BigInt(user.sub));
  }
}
