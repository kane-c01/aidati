import { Controller, Get, Param, Query } from '@nestjs/common';

import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

import { BookService } from './book.service';
import { ListBooksQuery } from './dto/list-books.query';

/**
 * 书库控制器(用户侧)
 * 文档:03-API接口文档.md §四
 *
 * 公开接口?用户已登录但 V2 才支持游客浏览;MVP 默认登录态可访问。
 * 收藏 / 上传等 V2 功能在本控制器留位但暂不开。
 */
@Controller('books')
export class BookController {
  constructor(private readonly bookService: BookService) {}

  @Get()
  async list(@Query() query: ListBooksQuery) {
    return this.bookService.listForUser(query);
  }

  @Get(':id')
  async detail(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.bookService.getDetail(id);
  }
}
