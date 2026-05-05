import { Controller, Get, Query } from '@nestjs/common';

import { Roles } from '../../common/decorators/roles.decorator';

import { ListAuditsQuery } from './dto/admin-config.dto';
import { AdminModerationService } from './services/admin-moderation.service';

/**
 * 内容审核日志 — admin 可查
 * 文档:03-API §12.8
 */
@Controller('admin/moderation-logs')
@Roles('admin', 'super_admin')
export class AdminModerationController {
  constructor(private readonly service: AdminModerationService) {}

  @Get()
  async list(@Query() query: ListAuditsQuery) {
    return this.service.list(query);
  }
}
