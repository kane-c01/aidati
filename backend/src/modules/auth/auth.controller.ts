import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

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

  // 登录类接口收紧到 1 分钟 10 次 / 1 小时 60 次,挡爆破
  // 微信登录每 IP 10/分够用(真实用户 1 分钟内重试 10 次已经异常)
  @Public()
  @Throttle({
    short: { limit: 10, ttl: 60_000 },
    long: { limit: 60, ttl: 60 * 60_000 },
  })
  @Post('wechat-login')
  @HttpCode(HttpStatus.OK)
  async wechatLogin(@Body() dto: WechatLoginDto): Promise<LoginResult> {
    return this.authService.wechatLogin(dto);
  }

  /** 后台账号密码登录 — 限 admin / super_admin, 比微信登录更严格(防字典) */
  @Public()
  @Throttle({
    short: { limit: 5, ttl: 60_000 },
    long: { limit: 30, ttl: 60 * 60_000 },
  })
  @Post('admin-login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(@Body() dto: AdminLoginDto): Promise<LoginResult> {
    return this.authService.adminLogin(dto);
  }

  @Public()
  @Throttle({ short: { limit: 20, ttl: 60_000 } })
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
