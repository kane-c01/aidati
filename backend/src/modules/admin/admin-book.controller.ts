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
import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/types/auth.types';

import {
  CreateBookDto,
  CreateBookFromPhotoSetDto,
  ImportChaptersDto,
  ImportFromPhotoSetDto,
  ImportPdfDto,
  ListAdminBooksQuery,
  UpdateBookDto,
} from './dto/admin-book.dto';
import { AdminBookService } from './services/admin-book.service';

@Controller('admin/books')
@Roles('admin', 'super_admin')
export class AdminBookController {
  constructor(private readonly service: AdminBookService) {}

  @Get()
  async list(@Query() query: ListAdminBooksQuery) {
    return this.service.list(query);
  }

  @Get(':id')
  async detail(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Query('include_chapter_full') includeChapterFull?: string,
  ) {
    const full =
      includeChapterFull === '1' || includeChapterFull === 'true' || includeChapterFull === 'yes';
    return this.service.detail(id, full);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateBookDto) {
    return this.service.create(BigInt(user.sub), dto);
  }

  /**
   * POST /v1/admin/books/from-photo-set —— 从已校对拍照集创建书籍
   * 必须声明在 :id 路由之前,避免 NestJS 把 'from-photo-set' 当作 id
   */
  @Post('from-photo-set')
  @HttpCode(HttpStatus.CREATED)
  async fromPhotoSet(@CurrentUser() user: JwtPayload, @Body() dto: CreateBookFromPhotoSetDto) {
    return this.service.createFromPhotoSet(BigInt(user.sub), dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateBookDto,
  ) {
    return this.service.update(BigInt(user.sub), id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.softDelete(BigInt(user.sub), id);
  }

  @Post(':id/recommend')
  @HttpCode(HttpStatus.OK)
  async recommend(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.setRecommend(BigInt(user.sub), id, true);
  }

  @Post(':id/unrecommend')
  @HttpCode(HttpStatus.OK)
  async unrecommend(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.setRecommend(BigInt(user.sub), id, false);
  }

  @Post(':id/online')
  @HttpCode(HttpStatus.OK)
  async online(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.setStatus(BigInt(user.sub), id, 1);
  }

  @Post(':id/offline')
  @HttpCode(HttpStatus.OK)
  async offline(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.setStatus(BigInt(user.sub), id, 0);
  }

  @Post(':id/chapters')
  @HttpCode(HttpStatus.CREATED)
  async importChapters(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ImportChaptersDto,
  ) {
    return this.service.importChapters(BigInt(user.sub), id, dto);
  }

  /**
   * POST /v1/admin/books/:id/import-pdf —— PDF 自动抽章节(M8)
   * - 不传 body 时使用 book.pdf_url
   * - 流程:pdfplumber 抽文字 → LLM 切章 → 整体替换原 chapters
   */
  @Post(':id/import-pdf')
  @HttpCode(HttpStatus.OK)
  async importPdf(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ImportPdfDto,
  ) {
    return this.service.importPdfToChapters(
      BigInt(user.sub),
      id,
      dto?.pdf_url ?? null,
      dto?.max_chapters,
    );
  }

  /**
   * POST /v1/admin/books/:id/import-from-photo-set —— 将拍照集内容导入已有书籍的章节
   * 读取 photo_set.ocr_text → LLM 切章 → 替换当前 chapters
   */
  @Post(':id/import-from-photo-set')
  @HttpCode(HttpStatus.OK)
  async importFromPhotoSet(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ImportFromPhotoSetDto,
  ) {
    return this.service.importFromPhotoSet(BigInt(user.sub), id, BigInt(dto.photo_set_id));
  }
}
