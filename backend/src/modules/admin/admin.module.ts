import { Module } from '@nestjs/common';

import { AdminBookController } from './admin-book.controller';
import { AdminConfigController } from './admin-config.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminModerationController } from './admin-moderation.controller';
import { AdminPhotoController } from './admin-photo.controller';
import { AdminUserController } from './admin-user.controller';
import { AdminBookService } from './services/admin-book.service';
import { AdminConfigService } from './services/admin-config.service';
import { AdminLogService } from './services/admin-log.service';
import { AdminModerationService } from './services/admin-moderation.service';
import { AdminPhotoService } from './services/admin-photo.service';
import { AdminStatsService } from './services/admin-stats.service';
import { AdminUserService } from './services/admin-user.service';

/**
 * 管理员模块(M7+M8)
 *
 * 控制器:
 * - GET    /v1/admin/dashboard                 工作台
 * - CRUD   /v1/admin/books                      书籍管理 + 章节导入
 * - GET    /v1/admin/users 等                   用户管理 / 任命 / 免职
 * - GET    /v1/admin/configs / PUT/:key         系统配置(super_admin)
 * - GET    /v1/admin/moderation-logs           内容审核日志
 * - GET    /v1/admin/photo-sets                 用户拍照集列表 / 详情 / 校对 / 级联删除
 *
 * 全部接口由全局 RolesGuard 校验 admin / super_admin
 */
@Module({
  controllers: [
    AdminDashboardController,
    AdminBookController,
    AdminUserController,
    AdminConfigController,
    AdminModerationController,
    AdminPhotoController,
  ],
  providers: [
    AdminLogService,
    AdminStatsService,
    AdminBookService,
    AdminUserService,
    AdminConfigService,
    AdminModerationService,
    AdminPhotoService,
  ],
  exports: [AdminLogService],
})
export class AdminModule {}
