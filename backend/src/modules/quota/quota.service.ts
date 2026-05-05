import { Injectable, Logger } from '@nestjs/common';
import { type UserRole } from '@prisma/client';

import { ERROR_CODES } from '../../common/constants/error-codes';
import {
  BusinessException,
  QuotaExceededException,
} from '../../common/exceptions/business.exception';
import {
  nextShanghaiMidnightUtc,
  todayInShanghaiAsDate,
  todayInShanghaiString,
} from '../../common/utils/timezone';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';

export interface QuotaSnapshot {
  date: string;
  used: number;
  limit: number;
  remaining: number;
  reset_at: string;
}

/**
 * 出题额度服务
 * 文档:02-数据库 §3.10 / 03-API §1.3 / PRD §10.2
 *
 * 设计要点:
 * - 「自然日(Asia/Shanghai)」切割, 每天 00:00 自然重置(无需 cron)
 * - DB 是真实来源, Redis 仅作快速读 + 抢配额时的原子计数
 * - check + incr 走 DB 事务, 保证不超额;Redis 同步再回写
 * - 取消/失败可 decr 回退
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * 读 user 当天剩余配额(不增不减)
   */
  async getSnapshot(userId: bigint, role: UserRole): Promise<QuotaSnapshot> {
    const todayDate = todayInShanghaiAsDate();
    const dateStr = todayInShanghaiString();
    const reset = nextShanghaiMidnightUtc();

    const [quota, totalPapers] = await Promise.all([
      this.prisma.usageQuota.findUnique({
        where: { userId_date: { userId, date: todayDate } },
      }),
      this.prisma.paper.count({ where: { userId } }),
    ]);

    const used = quota?.usedCount ?? 0;
    const bonus = quota?.inviteBonus ?? 0;
    const baseLimit = await this.getDailyLimit(role, totalPapers === 0);
    const limit = baseLimit + bonus;

    return {
      date: dateStr,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      reset_at: reset.toISOString(),
    };
  }

  /**
   * 检查并占用 1 个配额
   *
   * 实现:DB UPSERT + 原子条件 SELECT used_count;若超过 limit 抛 30001
   * 成功后 Redis 缓存同步 +1, 用于其它地方快速读
   *
   * @returns 占用后的快照
   */
  async checkAndConsume(userId: bigint, role: UserRole): Promise<QuotaSnapshot> {
    const todayDate = todayInShanghaiAsDate();
    const dateStr = todayInShanghaiString();
    const reset = nextShanghaiMidnightUtc();

    const totalPapers = await this.prisma.paper.count({ where: { userId } });
    const baseLimit = await this.getDailyLimit(role, totalPapers === 0);

    // 在事务里:upsert 行 → 读取最新 used_count → 若 > limit + bonus 回滚抛错
    const consumed = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.usageQuota.upsert({
        where: { userId_date: { userId, date: todayDate } },
        update: { usedCount: { increment: 1 } },
        create: {
          userId,
          date: todayDate,
          usedCount: 1,
          inviteBonus: 0,
        },
      });
      const limit = baseLimit + upserted.inviteBonus;
      if (upserted.usedCount > limit) {
        // 显式回滚事务
        throw new QuotaExceededException(
          `今日已使用 ${upserted.usedCount - 1}/${limit},额度已用尽`,
        );
      }
      return upserted;
    });

    // Redis 缓存同步, 失败不影响主流程
    this.bumpRedis(userId, dateStr, reset.getTime() - Date.now()).catch((err) => {
      this.logger.warn(`Redis 配额同步失败 user=${userId}: ${(err as Error).message}`);
    });

    return {
      date: dateStr,
      used: consumed.usedCount,
      limit: baseLimit + consumed.inviteBonus,
      remaining: Math.max(0, baseLimit + consumed.inviteBonus - consumed.usedCount),
      reset_at: reset.toISOString(),
    };
  }

  /**
   * 退还 1 个配额(取消出题 / 出题失败)
   * 不会把 used_count 减到负数
   */
  async refund(userId: bigint, reason: string): Promise<void> {
    const todayDate = todayInShanghaiAsDate();
    const dateStr = todayInShanghaiString();

    const updated = await this.prisma.usageQuota.findUnique({
      where: { userId_date: { userId, date: todayDate } },
    });
    if (!updated || updated.usedCount <= 0) return;

    await this.prisma.usageQuota.update({
      where: { userId_date: { userId, date: todayDate } },
      data: { usedCount: { decrement: 1 } },
    });

    this.redis.client
      .decr(this.redisKey(userId, dateStr))
      .catch((err) => this.logger.warn(`Redis decr 失败: ${(err as Error).message}`));

    this.logger.log(`配额退还 user=${userId} reason=${reason}`);
  }

  // ===== 内部辅助 =====

  private redisKey(userId: bigint, dateStr: string): string {
    return `quota:${userId.toString()}:${dateStr}`;
  }

  private async bumpRedis(userId: bigint, dateStr: string, ttlMs: number): Promise<void> {
    const key = this.redisKey(userId, dateStr);
    const ttlSec = Math.max(60, Math.floor(ttlMs / 1000));
    const pipeline = this.redis.client.multi();
    pipeline.incr(key);
    pipeline.expire(key, ttlSec, 'NX');
    await pipeline.exec();
  }

  /**
   * 读 system_config 拿配额上限, 缺省回退 02 文档默认值
   */
  private async getDailyLimit(role: UserRole, isFirstDay: boolean): Promise<number> {
    const keyName =
      role === 'admin' || role === 'super_admin'
        ? 'daily_quota_admin'
        : isFirstDay
          ? 'daily_quota_user_first'
          : 'daily_quota_user';

    const cfg = await this.prisma.systemConfig.findUnique({ where: { keyName } });
    if (!cfg) {
      const fallback = role === 'user' ? (isFirstDay ? 5 : 10) : 50;
      this.logger.warn(`system_config[${keyName}] 缺失, 回退 ${fallback}`);
      return fallback;
    }
    if (typeof cfg.value === 'number') return cfg.value;
    if (typeof cfg.value === 'string') return parseInt(cfg.value, 10) || 0;
    if (cfg.value && typeof cfg.value === 'object' && 'value' in (cfg.value as object)) {
      const inner = (cfg.value as { value: unknown }).value;
      if (typeof inner === 'number') return inner;
      if (typeof inner === 'string') return parseInt(inner, 10) || 0;
    }
    throw new BusinessException(ERROR_CODES.DB_ERROR, `system_config[${keyName}] 值非法`);
  }
}
