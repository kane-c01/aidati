import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { JwtPayload } from '../../common/types/auth.types';

import { BindPhotoDto } from './dto/bind-photo.dto';
import { UpdatePhotoDto } from './dto/update-photo.dto';
import { PhotoService } from './photo.service';

/**
 * 单张图片操作
 * 文档:03-API §5.2 / §5.4
 */
@Controller('photos')
export class PhotoController {
  constructor(private readonly photoService: PhotoService) {}

  @Post()
  async bind(@CurrentUser() user: JwtPayload, @Body() dto: BindPhotoDto) {
    return this.photoService.bindPhoto(BigInt(user.sub), dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdatePhotoDto,
  ) {
    return this.photoService.updatePhoto(BigInt(user.sub), id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.photoService.deletePhoto(BigInt(user.sub), id);
  }
}
