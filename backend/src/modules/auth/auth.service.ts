import { Injectable, Logger } from '@nestjs/common';
import { type User, UserRole } from '@prisma/client';

import {
  BusinessException,
  UnauthorizedBusinessException,
} from '../../common/exceptions/business.exception';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { maskOpenid } from '../../common/utils/mask';
import { PrismaService } from '../../infra/prisma/prisma.service';

import type { WechatLoginDto } from './dto/wechat-login.dto';
import type { CancelAccountDto } from './dto/cancel-account.dto';
import { TokenService, type TokenPair } from './services/token.service';
import { WechatService } from './services/wechat.service';

export interface LoginResult extends TokenPair {
  user: {
    id: string;
    nickname: string | null;
    avatar_url: string | null;
    role: UserRole;
    is_minor: number;
    minor_mode_enabled: number;
    is_first_login: boolean;
  };
}

/**
 * 鉴权服务
 * 文档:03-API接口文档.md §二
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** 注销冷静期 7 天, 见 PRD §7.4.1 */
  private static readonly CANCEL_GRACE_DAYS = 7;

  constructor(
    private readonly prisma: PrismaService,
    private readonly wechat: WechatService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * 微信登录 - jscode2session → 查/建用户 → 检查状态 → 签发 token
   */
  async wechatLogin(dto: WechatLoginDto): Promise<LoginResult> {
    const session = await this.wechat.code2session(dto.code);

    const existing = await this.prisma.user.findUnique({
      where: { openid: session.openid },
    });

    let user: User;
    let isFirstLogin = false;

    if (!existing) {
      isFirstLogin = true;
      user = await this.prisma.user.create({
        data: {
          openid: session.openid,
          unionid: session.unionid ?? null,
          nickname: dto.user_info?.nickname ?? null,
          avatarUrl: dto.user_info?.avatar_url ?? null,
          role: UserRole.user,
          status: 1,
          privacyVersion: dto.privacy_version ?? null,
          privacyAgreedAt: dto.agreed_at ? new Date(dto.agreed_at) : null,
          lastLoginAt: new Date(),
        },
      });
      this.logger.log(`新用户注册 openid=${maskOpenid(session.openid)} user_id=${user.id}`);
    } else {
      this.checkUserStatus(existing);

      // 更新登录时间 + 资料(若客户端传了)
      user = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          unionid: session.unionid ?? existing.unionid,
          nickname: dto.user_info?.nickname ?? existing.nickname,
          avatarUrl: dto.user_info?.avatar_url ?? existing.avatarUrl,
          privacyVersion: dto.privacy_version ?? existing.privacyVersion,
          privacyAgreedAt: dto.agreed_at ? new Date(dto.agreed_at) : existing.privacyAgreedAt,
          lastLoginAt: new Date(),
          // 如果是已注销用户在 7 天冷静期内重新登录, 自动取消注销
          deletedAt: existing.deletedAt ? null : existing.deletedAt,
          status: existing.deletedAt ? 1 : existing.status,
        },
      });
    }

    const tokens = await this.tokenService.sign({
      userId: user.id,
      openid: user.openid,
      role: user.role,
    });

    return {
      ...tokens,
      user: {
        id: user.id.toString(),
        nickname: user.nickname,
        avatar_url: user.avatarUrl,
        role: user.role,
        is_minor: user.isMinor,
        minor_mode_enabled: user.minorModeEnabled,
        is_first_login: isFirstLogin,
      },
    };
  }

  /**
   * 校验用户当前状态是否允许登录;失败抛业务异常
   */
  private checkUserStatus(user: User): void {
    if (user.status === 0) {
      throw new BusinessException(ERROR_CODES.USER_BANNED, undefined);
    }
    // status === -1 + 已过冷静期 → 真正禁止登录
    if (user.status === -1 && user.deletedAt) {
      const elapsed = Date.now() - user.deletedAt.getTime();
      const graceMs = AuthService.CANCEL_GRACE_DAYS * 86400_000;
      if (elapsed >= graceMs) {
        throw new BusinessException(ERROR_CODES.USER_CANCELED);
      }
      // 冷静期内允许登录, 之后会自动撤销注销
    }
  }

  /** 刷新 token */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const result = await this.tokenService.rotate(refreshToken);
    // 校验 user 仍可登录
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(result.sub) },
    });
    if (!user) throw new UnauthorizedBusinessException('用户不存在');
    this.checkUserStatus(user);
    return {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_in: result.expires_in,
    };
  }

  /**
   * 退出登录 - 把 access jti 加入黑名单
   * 注意:本接口不知道 refresh jti(客户端持有), 仅撤销当前 access
   */
  async logout(accessJti: string, accessExp: number): Promise<void> {
    await this.tokenService.revoke(accessJti, accessExp);
  }

  /**
   * 申请注销 - 7 天冷静期, 期间登录则取消(见 wechatLogin)
   */
  async cancelAccount(
    userId: bigint,
    _dto: CancelAccountDto,
  ): Promise<{ scheduled_delete_at: string; cancel_window_seconds: number }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedBusinessException('用户不存在');

    if (user.deletedAt) {
      // 已经在注销中, 返回原计划
      const scheduled = new Date(
        user.deletedAt.getTime() + AuthService.CANCEL_GRACE_DAYS * 86400_000,
      );
      return {
        scheduled_delete_at: scheduled.toISOString(),
        cancel_window_seconds: AuthService.CANCEL_GRACE_DAYS * 86400,
      };
    }

    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: now,
        status: -1,
      },
    });

    const scheduled = new Date(now.getTime() + AuthService.CANCEL_GRACE_DAYS * 86400_000);
    this.logger.warn(`用户申请注销 user_id=${userId} scheduled=${scheduled.toISOString()}`);

    return {
      scheduled_delete_at: scheduled.toISOString(),
      cancel_window_seconds: AuthService.CANCEL_GRACE_DAYS * 86400,
    };
  }

  /** 取消注销(冷静期内) */
  async cancelCancellation(userId: bigint): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedBusinessException('用户不存在');
    if (!user.deletedAt) return { ok: true };

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: null,
        status: 1,
      },
    });

    return { ok: true };
  }
}
