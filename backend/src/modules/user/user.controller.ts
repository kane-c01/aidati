import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/auth.types';
import { AuthService } from '../auth/auth.service';
import { CancelAccountDto } from '../auth/dto/cancel-account.dto';

import { AgreePrivacyDto } from './dto/agree-privacy.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserService, type PrivacyStatus, type UserBrief, type UserMeResult } from './user.service';

/**
 * 用户控制器
 * 文档:03-API接口文档.md §三 + §2.4/§2.5(/user/cancel 别名)
 */
@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

  @Get('me')
  async getMe(@CurrentUser() user: JwtPayload): Promise<UserMeResult> {
    return this.userService.getMe(BigInt(user.sub));
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserBrief> {
    return this.userService.updateMe(BigInt(user.sub), dto);
  }

  @Get('me/privacy')
  async getPrivacy(@CurrentUser() user: JwtPayload): Promise<PrivacyStatus> {
    return this.userService.getPrivacyStatus(BigInt(user.sub));
  }

  @Post('me/privacy/agree')
  @HttpCode(HttpStatus.OK)
  async agreePrivacy(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AgreePrivacyDto,
  ): Promise<PrivacyStatus> {
    return this.userService.agreePrivacy(BigInt(user.sub), dto.version);
  }

  /** 注销别名:`POST /user/cancel` ≡ `POST /auth/cancel-account` */
  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  async cancelAccount(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CancelAccountDto,
  ): Promise<{ scheduled_delete_at: string; cancel_window_seconds: number }> {
    return this.authService.cancelAccount(BigInt(user.sub), dto);
  }

  /** 撤销注销别名:`POST /user/cancel/cancel` */
  @Post('cancel/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelCancellation(@CurrentUser() user: JwtPayload): Promise<{ ok: true }> {
    return this.authService.cancelCancellation(BigInt(user.sub));
  }
}
