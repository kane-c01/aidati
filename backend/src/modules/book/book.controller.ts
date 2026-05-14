import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { JwtPayload } from '../../common/types/auth.types';

import { BookService } from './book.service';
import { ListBooksQuery } from './dto/list-books.query';
import {
  CreateBookFromPhotoSetDto,
  ListMyBooksQuery,
  PatchUserBookDto,
  UploadUserBookDto,
} from './dto/user-book.dto';

/**
 * 书库控制器(用户侧)
 * 文档:03-API接口文档.md §四
 *
 * 用户已登录访问;list/detail 都会基于 user.sub 染色 is_favorited
 *
 * M8 用户上传书:
 * - GET    /v1/books/mine             我的书库(自己上传的)
 * - POST   /v1/books/upload           上传 PDF 自建书(同步抽章 ~ 1-2 分钟)
 * - PATCH  /v1/books/:id              改名 / 换封面 / 改简介
 * - DELETE /v1/books/:id              软删自己的书
 */
@Controller('books')
export class BookController {
  constructor(private readonly bookService: BookService) {}

  // 注意:具体路径必须在 ':id' 之前声明, 否则 'mine' / 'upload' 会被当作 id 走 detail
  @Get('mine')
  async listMine(@CurrentUser() user: JwtPayload, @Query() query: ListMyBooksQuery) {
    return this.bookService.listMine(BigInt(user.sub), query.page, query.page_size);
  }

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  async upload(@CurrentUser() user: JwtPayload, @Body() dto: UploadUserBookDto) {
    return this.bookService.uploadUserBook(BigInt(user.sub), dto);
  }

  /** POST /v1/books/from-photo-set —— 把拍照集整理成一本"我的书" */
  @Post('from-photo-set')
  @HttpCode(HttpStatus.CREATED)
  async fromPhotoSet(@CurrentUser() user: JwtPayload, @Body() dto: CreateBookFromPhotoSetDto) {
    return this.bookService.createBookFromPhotoSet(BigInt(user.sub), BigInt(dto.photo_set_id), dto);
  }

  @Get()
  async list(@CurrentUser() user: JwtPayload, @Query() query: ListBooksQuery) {
    return this.bookService.listForUser(query, BigInt(user.sub));
  }

  @Get(':id')
  async detail(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.bookService.getDetail(id, BigInt(user.sub));
  }

  @Patch(':id')
  async patchMine(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: PatchUserBookDto,
  ) {
    return this.bookService.patchMyBook(BigInt(user.sub), id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteMine(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.bookService.deleteMyBook(BigInt(user.sub), id);
  }
}
