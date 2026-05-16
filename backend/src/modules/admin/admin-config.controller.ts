import { Body, Controller, Get, Param, Put } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/types/auth.types';

import { UpdateConfigDto } from './dto/admin-config.dto';
import { AdminConfigService } from './services/admin-config.service';

/**
 * 系统配置
 * 文档:03-API §12.7
 *
 * 权限:
 *  - GET     admin / super_admin  均可读 (敏感字段如 *_api_key / *_secret 自动脱敏为 ••••••••<last4>)
 *  - PUT     仅 super_admin       可写  (避免普通 admin 把 LLM Key 改写成自己的钓鱼地址)
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
  @Roles('super_admin')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('key') key: string,
    @Body() dto: UpdateConfigDto,
  ) {
    return this.service.update(BigInt(user.sub), key, dto);
  }
}
