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
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { JwtPayload } from '../../common/types/auth.types';

import { AdminUpdatePhotoDto, ListAdminPhotoSetsQuery } from './dto/admin-photo.dto';
import { AdminPhotoService } from './services/admin-photo.service';

/**
 * 管理员拍照集 / 单图操作
 *
 * - GET    /v1/admin/photo-sets               分页 + 过滤
 * - GET    /v1/admin/photo-sets/:id           详情(含 photos + regions)
 * - PATCH  /v1/admin/photos/:id               校对单张图(ocr_text / regions / order_no)
 * - DELETE /v1/admin/photo-sets/:id           级联删除
 */
@Controller('admin')
@Roles('admin', 'super_admin')
export class AdminPhotoController {
  constructor(private readonly service: AdminPhotoService) {}

  @Get('photo-sets')
  async list(@Query() query: ListAdminPhotoSetsQuery) {
    return this.service.list(query);
  }

  @Get('photo-sets/:id')
  async detail(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.detail(id);
  }

  @Patch('photos/:id')
  async patchPhoto(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: AdminUpdatePhotoDto,
  ) {
    return this.service.patchPhoto(BigInt(user.sub), id, dto);
  }

  /** 管理员对单个 region 触发视觉识别(M8) */
  @Post('photos/:id/regions/:rid/recognize')
  @HttpCode(HttpStatus.OK)
  async recognizeRegion(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('rid') rid: string,
  ) {
    return this.service.recognizeRegion(BigInt(user.sub), id, rid);
  }

  @Delete('photo-sets/:id')
  @HttpCode(HttpStatus.OK)
  async deleteSet(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.deleteSet(BigInt(user.sub), id);
  }
}
