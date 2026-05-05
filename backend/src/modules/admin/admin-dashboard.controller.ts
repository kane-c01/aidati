import { Controller, Get } from '@nestjs/common';

import { Roles } from '../../common/decorators/roles.decorator';

import { AdminStatsService } from './services/admin-stats.service';

/**
 * 管理员工作台
 * 文档:03-API §12.1
 */
@Controller('admin')
@Roles('admin', 'super_admin')
export class AdminDashboardController {
  constructor(private readonly stats: AdminStatsService) {}

  @Get('dashboard')
  async dashboard() {
    return this.stats.getDashboard();
  }
}
