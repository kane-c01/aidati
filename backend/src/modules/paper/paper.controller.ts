import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { JwtPayload } from '../../common/types/auth.types';

import { CreatePaperDto } from './dto/create-paper.dto';
import { ListPapersQuery } from './dto/list-papers.query';
import { SaveDraftDto } from './dto/save-draft.dto';
import { SubmitAnswersDto } from './dto/submit-answers.dto';
import { PaperService } from './paper.service';

/**
 * 试卷控制器
 * 文档:03-API §七
 *
 * 接口:
 * - POST /v1/papers          创建并触发出题(202)
 * - GET  /v1/papers/{id}     查询试卷 / 题目
 * - POST /v1/papers/{id}/cancel
 * - POST /v1/papers/{id}/draft
 * - GET  /v1/papers/{id}/draft
 * - POST /v1/papers/{id}/submit
 * - GET  /v1/papers/{id}/result
 */
@Controller('papers')
export class PaperController {
  constructor(private readonly paperService: PaperService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePaperDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.paperService.createPaper(BigInt(user.sub), user.role, dto, idempotencyKey);
  }

  @Get()
  async list(@CurrentUser() user: JwtPayload, @Query() query: ListPapersQuery) {
    return this.paperService.listUserPapers(BigInt(user.sub), {
      status: query.status,
      bookId: query.book_id ? BigInt(query.book_id) : null,
      chapterId: query.chapter_id ? BigInt(query.chapter_id) : null,
      page: query.page,
      pageSize: query.page_size,
    });
  }

  @Get(':id')
  async get(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    // 注: 前端契约是 { paper: PaperView }(见 miniprogram/types/api.ts PaperDetailResponse),
    // 这里必须包一层, 否则 paper-loading / paper-answer 解构出 undefined → 静默 TypeError → 死轮询
    const paper = await this.paperService.getPaper(BigInt(user.sub), id);
    return { paper };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.paperService.cancelPaper(BigInt(user.sub), id);
  }

  @Post(':id/draft')
  @HttpCode(HttpStatus.OK)
  async saveDraft(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: SaveDraftDto,
  ) {
    return this.paperService.saveDraft(BigInt(user.sub), id, dto);
  }

  @Get(':id/draft')
  async getDraft(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.paperService.getDraft(BigInt(user.sub), id);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.ACCEPTED)
  async submit(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: SubmitAnswersDto,
  ) {
    return this.paperService.submitPaper(BigInt(user.sub), id, dto);
  }

  @Get(':id/result')
  async getResult(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.paperService.getResult(BigInt(user.sub), id);
  }
}
