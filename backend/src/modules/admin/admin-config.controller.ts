import { Body, Controller, Get, Param, Put } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/types/auth.types';

import { UpdateConfigDto } from './dto/admin-config.dto';
import { AdminConfigService } from './services/admin-config.service';

/**
 * 系统配置(M8 起对所有 admin 开放,因为部分配置如 AI 密钥需要业务管理员自助配置)
 * 高风险项(如协议版本号)由前端二次确认弹窗兜底
 * 文档:03-API §12.7
 */
@Controller('admin/configs')
@Roles('admin', 'super_admin')
export class AdminConfigController {
  constructor(private readonly service: AdminConfigService) {}

  @Get()
  async listAll() {
    return this.service.listAll();
  }

  @Put(':key')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('key') key: string,
    @Body() dto: UpdateConfigDto,
  ) {
    return this.service.update(BigInt(user.sub), key, dto);
  }
}
