import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { FeedbackController } from './feedback.controller';
import { UserController } from './user.controller';
import { UserService } from './user.service';

/**
 * 用户模块
 * - /user/me / /user/me/privacy / /user/cancel ...
 * - /feedback
 *
 * 依赖 AuthModule 提供 AuthService(注销别名走相同业务)
 */
@Module({
  imports: [AuthModule],
  controllers: [UserController, FeedbackController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
