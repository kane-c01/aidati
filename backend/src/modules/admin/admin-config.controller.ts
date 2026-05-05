import { Body, Controller, Get, Param, Put } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/types/auth.types';

import { UpdateConfigDto } from './dto/admin-config.dto';
import { AdminConfigService } from './services/admin-config.service';

/**
 * 系统配置 — super_admin 专属
 * 文档:03-API §12.7
 */
@Controller('admin/configs')
@Roles('super_admin')
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
