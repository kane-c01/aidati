import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { JwtPayload } from '../../common/types/auth.types';

import { CreatePhotoSetFromPdfDto } from './dto/create-set-from-pdf.dto';
import { ReorderPhotosDto } from './dto/reorder-photos.dto';
import { StartOcrDto } from './dto/start-ocr.dto';
import { UpdateOcrDto } from './dto/update-ocr.dto';
import { PhotoService } from './photo.service';

/**
 * 拍照集级别操作
 * 文档:03-API §5.4(reorder)+ §6(OCR)
 */
@Controller('photo-sets')
export class PhotoSetController {
  constructor(private readonly photoService: PhotoService) {}

  /**
   * 拍照页统一入口:PDF → 拍照集
   * 文档:03-API §5(M8 PR2.6 增补)
   */
  @Post('from-pdf')
  @HttpCode(HttpStatus.CREATED)
  async createFromPdf(@CurrentUser() user: JwtPayload, @Body() dto: CreatePhotoSetFromPdfDto) {
    return this.photoService.createSetFromPdf(BigInt(user.sub), dto, { sourceKind: 'pdf' });
  }

  /**
   * GET /v1/photo-sets/:id —— 取拍照集元信息(M8 PR2.6, 反向跳书)
   *
   * 不含 photos 内容, 仅 meta;若需要照片列表请用 GET /v1/photo-sets/:id/ocr
   */
  @Get(':id')
  async getMeta(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.photoService.getSetMeta(BigInt(user.sub), id);
  }

  /** 调整图片顺序 */
  @Patch(':id/reorder')
  @HttpCode(HttpStatus.OK)
  async reorder(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ReorderPhotosDto,
  ): Promise<{ ok: true }> {
    return this.photoService.reorderPhotos(BigInt(user.sub), id, dto);
  }

  /** 触发 OCR(202 异步) */
  @Post(':id/ocr')
  @HttpCode(HttpStatus.ACCEPTED)
  async startOcr(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: StartOcrDto,
  ) {
    return this.photoService.startOcr(BigInt(user.sub), id, dto.mode ?? 'wechat');
  }

  /**
   * 查询 OCR 状态 + 当前文本
   *
   * 注意: 内部 OcrSnapshot 用 `status`, 但 03-API §6 / 前端契约约定字段名是 `ocr_status`,
   * controller 这里做一次 snake_case 整理, 避免前端轮询读不到字段一直空转。
   */
  @Get(':id/ocr')
  async getOcr(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    const r = await this.photoService.getOcr(BigInt(user.sub), id);
    return {
      ocr_status: r.status,
      progress: r.progress,
      ocr_text: r.ocr_text,
      items: r.items,
    };
  }

  /** 客户端 OCR 写回 / 用户校对 */
  @Patch(':id/ocr')
  @HttpCode(HttpStatus.OK)
  async patchOcr(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateOcrDto,
  ) {
    return this.photoService.updateOcr(BigInt(user.sub), id, dto);
  }
}
