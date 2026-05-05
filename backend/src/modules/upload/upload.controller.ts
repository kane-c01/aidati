import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsString } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/auth.types';
import type { UploadPolicy, UploadScene } from '../../infra/storage/storage.service';

import { UploadPolicyQuery } from './dto/upload-policy.query';
import { UploadService } from './upload.service';

class SimpleUploadBody {
  @IsString()
  @IsIn(['photo', 'cover', 'pdf'])
  scene!: UploadScene;
}

interface MulterFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/**
 * 文件上传控制器
 * 文档:03-API接口文档.md §五
 */
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Get('policy')
  async policy(
    @CurrentUser() user: JwtPayload,
    @Query() query: UploadPolicyQuery,
  ): Promise<UploadPolicy> {
    return this.uploadService.getPolicy(BigInt(user.sub), query.scene, query.content_type);
  }

  /**
   * 后端转存(适合首页 banner / 默认头像等小文件)
   * 业务侧主要还是直传;本接口为兜底
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async simpleUpload(
    @CurrentUser() user: JwtPayload,
    @Body() body: SimpleUploadBody,
    @UploadedFile() file: MulterFile,
  ): Promise<{ key: string; url: string }> {
    if (!file) {
      throw new Error('缺少 file 字段');
    }
    return this.uploadService.simpleUpload(
      BigInt(user.sub),
      body.scene,
      file.buffer,
      file.mimetype,
    );
  }
}
