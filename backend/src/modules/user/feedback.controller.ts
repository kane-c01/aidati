import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/auth.types';

import { FeedbackDto } from './dto/feedback.dto';
import { UserService } from './user.service';

/**
 * 反馈控制器
 * 文档:03-API §3.4 — 路径是 `/feedback`(不带 /user 前缀)
 */
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async submit(@CurrentUser() user: JwtPayload, @Body() dto: FeedbackDto): Promise<{ ok: true }> {
    return this.userService.submitFeedback(BigInt(user.sub), dto);
  }
}
