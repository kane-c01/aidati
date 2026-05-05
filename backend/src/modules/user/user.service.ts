import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModerationScene, type User, UserRole } from '@prisma/client';

import {
  BusinessException,
  NotFoundBusinessException,
} from '../../common/exceptions/business.exception';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { maskOpenid } from '../../common/utils/mask';
import { nextShanghaiMidnightUtc, todayInShanghaiAsDate } from '../../common/utils/timezone';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';

import type { FeedbackDto } from './dto/feedback.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';

export interface UserBrief {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_minor: number;
  minor_mode_enabled: number;
}

export interface UserStats {
  total_papers: number;
  total_questions: number;
  /** 0~1 保留 4 位小数 */
  accuracy_rate: number;
  active_mistakes: number;
  mastered_mistakes: number;
}

export interface QuotaSnapshot {
  used_quota: number;
  limit: number;
  /** ISO 8601 UTC, 下一个上海 00:00 */
  reset_at: string;
}

export interface UserMeResult {
  user: UserBrief;
  stats: UserStats;
  today: QuotaSnapshot;
}

export interface PrivacyStatus {
  current_version: string;
  user_version: string | null;
  agreed_at: string | null;
  need_reagree: boolean;
}

/**
 * 用户业务服务
 * 文档:03-API接口文档.md §三
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly moderation: ModerationService,
  ) {}

  /**
   * GET /user/me — 个人资料 + 学习统计 + 今日配额
   */
  async getMe(userId: bigint): Promise<UserMeResult> {
    const user = await this.findUserOrThrow(userId);
    const [stats, today] = await Promise.all([
      this.getStats(userId),
      this.getTodayQuota(userId, user.role),
    ]);

    return {
      user: this.toBrief(user),
      stats,
      today,
    };
  }

  /**
   * PATCH /user/me — 更新个人资料
   * 关键约束:is_minor=1 一旦设置不可改回 0(PRD §7.5.2)
   */
  async updateMe(userId: bigint, dto: UpdateProfileDto): Promise<UserBrief> {
    const user = await this.findUserOrThrow(userId);

    if (dto.is_minor === 0 && user.isMinor === 1) {
      throw new BusinessException(
        ERROR_CODES.PARAM_INVALID,
        '未成年标识一旦开启不可自助关闭, 请联系客服',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        nickname: dto.nickname ?? user.nickname,
        avatarUrl: dto.avatar_url ?? user.avatarUrl,
        isMinor: dto.is_minor ?? user.isMinor,
        minorModeEnabled: dto.minor_mode_enabled ?? user.minorModeEnabled,
      },
    });

    return this.toBrief(updated);
  }

  /**
   * GET /user/me/privacy — 隐私协议状态
   * current 来自 system_config(key=privacy_version), 缺省 'v1.0'
   */
  async getPrivacyStatus(userId: bigint): Promise<PrivacyStatus> {
    const user = await this.findUserOrThrow(userId);
    const current = await this.getCurrentPrivacyVersion();
    return {
      current_version: current,
      user_version: user.privacyVersion,
      agreed_at: user.privacyAgreedAt ? user.privacyAgreedAt.toISOString() : null,
      need_reagree: user.privacyVersion !== current,
    };
  }

  /**
   * 用户重新同意隐私协议(由协议升级弹窗触发)
   */
  async agreePrivacy(userId: bigint, version: string): Promise<PrivacyStatus> {
    await this.findUserOrThrow(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        privacyVersion: version,
        privacyAgreedAt: new Date(),
      },
    });
    return this.getPrivacyStatus(userId);
  }

  /**
   * POST /feedback — 用户反馈
   *
   * MVP 不建独立反馈表(不在 02 文档 14 张 MVP 表中);
   * 暂以 admin_log 记录便于运营回溯, V2 再单建 feedback 表
   */
  async submitFeedback(userId: bigint, dto: FeedbackDto): Promise<{ ok: true }> {
    const user = await this.findUserOrThrow(userId);

    // 内容安全:反馈正文 + 联系方式都过审一遍
    if (dto.content && dto.content.trim().length > 0) {
      await this.moderation.checkOrThrow({
        scene: ModerationScene.answer,
        userId,
        text: dto.content,
      });
    }
    if (dto.contact && dto.contact.trim().length > 0) {
      await this.moderation.checkOrThrow({
        scene: ModerationScene.answer,
        userId,
        text: dto.contact,
      });
    }

    await this.prisma.adminLog.create({
      data: {
        adminId: user.id,
        action: 'user.feedback',
        targetType: 'feedback',
        targetId: null,
        meta: {
          content: dto.content,
          contact: dto.contact ?? null,
          screenshots: dto.screenshots ?? [],
        },
      },
    });

    this.logger.log(
      `用户反馈 user_id=${userId} openid=${maskOpenid(user.openid)} content_len=${dto.content.length}`,
    );

    return { ok: true };
  }

  // ===== 内部辅助 =====

  private async findUserOrThrow(userId: bigint): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundBusinessException('用户不存在');
    return user;
  }

  private toBrief(user: User): UserBrief {
    return {
      id: user.id.toString(),
      nickname: user.nickname,
      avatar_url: user.avatarUrl,
      role: user.role,
      is_minor: user.isMinor,
      minor_mode_enabled: user.minorModeEnabled,
    };
  }

  private async getStats(userId: bigint): Promise<UserStats> {
    const [totalPapers, gradedAnswers, correctAnswers, activeMistakes, masteredMistakes] =
      await Promise.all([
        this.prisma.paper.count({ where: { userId } }),
        this.prisma.answer.count({ where: { userId, isCorrect: { not: null } } }),
        this.prisma.answer.count({ where: { userId, isCorrect: 1 } }),
        this.prisma.mistake.count({ where: { userId, status: 'active' } }),
        this.prisma.mistake.count({
          where: { userId, status: { in: ['mastered', 'manual_mastered'] } },
        }),
      ]);

    const accuracy = gradedAnswers > 0 ? correctAnswers / gradedAnswers : 0;

    return {
      total_papers: totalPapers,
      total_questions: gradedAnswers,
      accuracy_rate: Math.round(accuracy * 10000) / 10000,
      active_mistakes: activeMistakes,
      mastered_mistakes: masteredMistakes,
    };
  }

  private async getTodayQuota(userId: bigint, role: UserRole): Promise<QuotaSnapshot> {
    const todayDate = todayInShanghaiAsDate();
    const reset = nextShanghaiMidnightUtc();

    const [quota, totalPapers] = await Promise.all([
      this.prisma.usageQuota.findUnique({
        where: { userId_date: { userId, date: todayDate } },
      }),
      this.prisma.paper.count({ where: { userId } }),
    ]);

    const usedToday = quota?.usedCount ?? 0;
    const inviteBonus = quota?.inviteBonus ?? 0;
    const baseLimit = await this.getDailyQuotaLimit(role, totalPapers === 0);

    return {
      used_quota: usedToday,
      limit: baseLimit + inviteBonus,
      reset_at: reset.toISOString(),
    };
  }

  /**
   * 读 system_config 拿默认配额
   * key 命名见 02 文档 §3.13
   */
  private async getDailyQuotaLimit(role: UserRole, isFirstDay: boolean): Promise<number> {
    const keyName =
      role === UserRole.admin || role === UserRole.super_admin
        ? 'daily_quota_admin'
        : isFirstDay
          ? 'daily_quota_user_first'
          : 'daily_quota_user';

    const cfg = await this.prisma.systemConfig.findUnique({ where: { keyName } });
    if (!cfg) {
      // 缺省值与 02-数据库设计文档.md §3.13 一致
      const fallback = role === UserRole.user ? (isFirstDay ? 5 : 10) : 50;
      this.logger.warn(`system_config[${keyName}] 未初始化, 使用默认值 ${fallback}`);
      return fallback;
    }

    const v = cfg.value;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return parseInt(v, 10) || 0;
    if (v && typeof v === 'object' && 'value' in (v as object)) {
      const inner = (v as { value: unknown }).value;
      if (typeof inner === 'number') return inner;
      if (typeof inner === 'string') return parseInt(inner, 10) || 0;
    }
    this.logger.warn(`system_config[${keyName}] 值格式异常: ${JSON.stringify(v)}`);
    return 0;
  }

  private async getCurrentPrivacyVersion(): Promise<string> {
    const cfg = await this.prisma.systemConfig.findUnique({
      where: { keyName: 'privacy_version' },
    });
    if (!cfg) return this.config.get<string>('PRIVACY_VERSION', 'v1.0');
    if (typeof cfg.value === 'string') return cfg.value;
    if (cfg.value && typeof cfg.value === 'object' && 'value' in (cfg.value as object)) {
      const inner = (cfg.value as { value: unknown }).value;
      if (typeof inner === 'string') return inner;
    }
    return 'v1.0';
  }
}
