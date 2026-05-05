import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { JwtPayload } from '../../common/types/auth.types';

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

  /** 查询 OCR 状态 + 当前文本 */
  @Get(':id/ocr')
  async getOcr(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.photoService.getOcr(BigInt(user.sub), id);
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
