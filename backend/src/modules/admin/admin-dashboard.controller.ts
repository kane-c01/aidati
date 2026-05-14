import { Controller, Get } from '@nestjs/common';

import { Roles } from '../../common/decorators/roles.decorator';
import { AiService } from '../../infra/ai-service/ai-service.service';

import { AdminStatsService } from './services/admin-stats.service';

/**
 * 管理员工作台
 * 文档:03-API §12.1
 */
@Controller('admin')
@Roles('admin', 'super_admin')
export class AdminDashboardController {
  constructor(
    private readonly stats: AdminStatsService,
    private readonly ai: AiService,
  ) {}

  @Get('dashboard')
  async dashboard() {
    return this.stats.getDashboard();
  }

  /**
   * GET /v1/admin/ai-health —— 后台一键测试 ai-service 是否能连
   * 用于 configs 页的"测试 AI 连接"按钮
   */
  @Get('ai-health')
  async aiHealth(): Promise<{ ok: boolean; ts: string }> {
    const ok = await this.ai.health();
    return { ok, ts: new Date().toISOString() };
  }
}
