import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { JwtPayload } from '../../common/types/auth.types';

import { AuthService, type LoginResult } from './auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CancelAccountDto } from './dto/cancel-account.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { WechatLoginDto } from './dto/wechat-login.dto';

/**
 * 鉴权控制器
 * 文档:03-API接口文档.md §二
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('wechat-login')
  @HttpCode(HttpStatus.OK)
  async wechatLogin(@Body() dto: WechatLoginDto): Promise<LoginResult> {
    return this.authService.wechatLogin(dto);
  }

  /** 后台账号密码登录 — 限 admin / super_admin */
  @Public()
  @Post('admin-login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(@Body() dto: AdminLoginDto): Promise<LoginResult> {
    return this.authService.adminLogin(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refresh_token);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: JwtPayload): Promise<{ ok: true }> {
    await this.authService.logout(user.jti, user.exp);
    return { ok: true };
  }

  /**
   * 注销账号 - 申请进入 7 天冷静期
   * 文档:03-API §2.4 / PRD §7.4.1
   */
  @Post('cancel-account')
  @HttpCode(HttpStatus.OK)
  async cancelAccount(@CurrentUser() user: JwtPayload, @Body() dto: CancelAccountDto) {
    return this.authService.cancelAccount(BigInt(user.sub), dto);
  }

  /** 取消注销(冷静期内) */
  @Post('cancel-account/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelCancellation(@CurrentUser() user: JwtPayload) {
    return this.authService.cancelCancellation(BigInt(user.sub));
  }
}
