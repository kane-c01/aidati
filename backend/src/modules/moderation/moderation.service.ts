import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import { type ModerationScene, ModerationResult, type Prisma } from '@prisma/client';

import { ERROR_CODES } from '../../common/constants/error-codes';
import { ContentBlockedException } from '../../common/exceptions/business.exception';
import { sha256 } from '../../common/utils/sha256';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';

export interface ModerationCheckArgs {
  scene: ModerationScene;
  /** 系统调用(LLM 输出审核)时为 null */
  userId: bigint | null;
  /** 文本场景必填, 图片场景留空 */
  text?: string;
  /** 图片场景必填(对象 URL,本系统只下载本桶里的对象) */
  imageUrl?: string;
}

export interface ModerationCheckResult {
  result: ModerationResult;
  reason: string | null;
  /** moderation_log 行 id, 出错可追 */
  log_id: bigint;
}

interface WechatTokenCache {
  access_token: string;
  expires_at: number;
}

interface WechatSecCheckResp {
  errcode: number;
  errmsg: string;
  result?: { suggest: 'pass' | 'review' | 'risky'; label?: number };
  detail?: Array<{
    suggest: 'pass' | 'review' | 'risky';
    label?: number;
    keyword?: string;
  }>;
}

/**
 * 内容安全审核
 * 文档:01-技术架构 / PRD §7.5.4(合规)/ 02-数据库 §3.11
 *
 * MVP 主路径:微信内容安全 API
 *   - msg_sec_check  文本(题干 / OCR / 反馈 / 自定义 prompt)
 *   - img_sec_check  图片字节(拍照 / 封面)
 *
 * Mock 模式(默认 dev):
 *   - 没有有效的 WECHAT_APPID/SECRET 时直接走 mock
 *   - text 内含「##BLOCK##」→ 强制 block,内含「##WARN##」→ warn(便于 e2e)
 *   - imageUrl 含「?moderation=block」→ 强制 block
 *
 * 命中策略:
 *   - block / risky  → 抛 ContentBlockedException(severe=true → 40002, 否则 40001)
 *   - warn           → 业务侧自行决定是否放过(MVP 直接通过,只记日志)
 *   - pass           → 通过
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private readonly http: AxiosInstance;
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly forceMock: boolean;

  /** Redis key 前缀已经由 RedisService 注入, 这里仅写后半段 */
  private static readonly REDIS_TOKEN_KEY = 'wx:moderation:access_token';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.appId = config.get<string>('WECHAT_APPID', '');
    this.appSecret = config.get<string>('WECHAT_SECRET', '');
    const explicitMock = config.get<string>('MODERATION_FORCE_MOCK', 'false');
    this.forceMock =
      explicitMock === 'true' ||
      !this.appId ||
      !this.appSecret ||
      this.appId.startsWith('__') ||
      this.appSecret.startsWith('__');
    this.http = axios.create({ baseURL: 'https://api.weixin.qq.com', timeout: 5000 });
    this.logger.log(`Moderation initialized force_mock=${this.forceMock}`);
  }

  // ===== 公开 API =====

  async check(args: ModerationCheckArgs): Promise<ModerationCheckResult> {
    if (args.text !== undefined) {
      return this.checkText(args.text, args);
    }
    if (args.imageUrl !== undefined) {
      return this.checkImage(args.imageUrl, args);
    }
    throw new Error('ModerationService.check: text 与 imageUrl 至少传一个');
  }

  /**
   * 校验失败直接抛业务异常
   * 适合在 controller / service 关键钉点直接调用
   */
  async checkOrThrow(args: ModerationCheckArgs): Promise<ModerationCheckResult> {
    const ret = await this.check(args);
    if (ret.result === ModerationResult.block) {
      throw new ContentBlockedException(ret.reason ?? '内容包含敏感信息', true);
    }
    if (ret.result === ModerationResult.warn) {
      this.logger.warn(`moderation.warn scene=${args.scene} reason=${ret.reason}`);
    }
    return ret;
  }

  // ===== 文本审核 =====

  private async checkText(text: string, args: ModerationCheckArgs): Promise<ModerationCheckResult> {
    const trimmed = text.trim();
    const contentHash = sha256(trimmed);

    let result: ModerationResult = ModerationResult.pass;
    let reason: string | null = null;
    let provider = 'wechat';

    if (this.forceMock) {
      provider = 'mock';
      if (trimmed.includes('##BLOCK##')) {
        result = ModerationResult.block;
        reason = 'mock: matched ##BLOCK##';
      } else if (trimmed.includes('##WARN##')) {
        result = ModerationResult.warn;
        reason = 'mock: matched ##WARN##';
      }
    } else {
      try {
        const resp = await this.callWechatTextCheck(trimmed, args);
        result = this.mapSuggest(resp.result?.suggest);
        reason = this.summarizeReason(resp);
      } catch (err) {
        this.logger.warn(`wechat text check failed: ${(err as Error).message}, fallback pass`);
        // 上游不可用时不能阻断业务, 走 pass + warn 日志(05 §6.3 容灾)
        provider = 'wechat-fallback';
      }
    }

    const logRow = await this.persistLog({
      ...args,
      contentHash,
      result,
      reason,
      provider,
    });
    return { result, reason, log_id: logRow.id };
  }

  // ===== 图片审核 =====

  private async checkImage(
    imageUrl: string,
    args: ModerationCheckArgs,
  ): Promise<ModerationCheckResult> {
    const contentHash = sha256(imageUrl);
    let result: ModerationResult = ModerationResult.pass;
    let reason: string | null = null;
    let provider = 'wechat';

    if (this.forceMock) {
      provider = 'mock';
      if (imageUrl.includes('moderation=block')) {
        result = ModerationResult.block;
        reason = 'mock: query moderation=block';
      } else if (imageUrl.includes('moderation=warn')) {
        result = ModerationResult.warn;
        reason = 'mock: query moderation=warn';
      }
    } else {
      try {
        const buf = await this.fetchImageBytes(imageUrl);
        const resp = await this.callWechatImageCheck(buf, args);
        result = this.mapSuggest(resp.result?.suggest);
        reason = this.summarizeReason(resp);
      } catch (err) {
        this.logger.warn(`wechat image check failed: ${(err as Error).message}, fallback pass`);
        provider = 'wechat-fallback';
      }
    }

    const logRow = await this.persistLog({
      ...args,
      contentHash,
      contentSnapshotUrl: imageUrl,
      result,
      reason,
      provider,
    });
    return { result, reason, log_id: logRow.id };
  }

  // ===== 内部:微信 API 调用 =====

  private async callWechatTextCheck(
    content: string,
    args: ModerationCheckArgs,
  ): Promise<WechatSecCheckResp> {
    const token = await this.getWechatToken();
    const sceneCode = this.mapSceneToWechat(args.scene);
    const { data } = await this.http.post<WechatSecCheckResp>(
      `/wxa/msg_sec_check?access_token=${token}`,
      {
        version: 2,
        openid: args.userId ? args.userId.toString() : 'system',
        scene: sceneCode,
        content,
      },
    );
    if (data.errcode !== 0 && data.errcode !== 87014) {
      throw new Error(`wxa/msg_sec_check errcode=${data.errcode} ${data.errmsg}`);
    }
    if (data.errcode === 87014) {
      return { ...data, result: { suggest: 'risky' } };
    }
    return data;
  }

  private async callWechatImageCheck(
    bytes: Buffer,
    _args: ModerationCheckArgs,
  ): Promise<WechatSecCheckResp> {
    const token = await this.getWechatToken();
    const { data } = await this.http.post<WechatSecCheckResp>(
      `/wxa/img_sec_check?access_token=${token}`,
      bytes,
      { headers: { 'Content-Type': 'application/octet-stream' } },
    );
    if (data.errcode !== 0 && data.errcode !== 87014) {
      throw new Error(`wxa/img_sec_check errcode=${data.errcode} ${data.errmsg}`);
    }
    if (data.errcode === 87014) {
      return { ...data, result: { suggest: 'risky' } };
    }
    return data;
  }

  /**
   * 拿微信 access_token, Redis 缓存 7200-60 秒
   */
  private async getWechatToken(): Promise<string> {
    const cached = await this.redis.client.get(ModerationService.REDIS_TOKEN_KEY);
    if (cached) {
      try {
        const obj = JSON.parse(cached) as WechatTokenCache;
        if (obj.expires_at > Date.now() + 60_000) return obj.access_token;
      } catch {
        /* 缓存损坏忽略 */
      }
    }
    const { data } = await this.http.get<{
      access_token: string;
      expires_in: number;
      errcode?: number;
      errmsg?: string;
    }>(`/cgi-bin/token?grant_type=client_credential&appid=${this.appId}&secret=${this.appSecret}`);
    if (data.errcode && data.errcode !== 0) {
      throw new Error(`wechat token errcode=${data.errcode} ${data.errmsg}`);
    }
    const ttl = Math.max(60, (data.expires_in ?? 7200) - 120);
    const cache: WechatTokenCache = {
      access_token: data.access_token,
      expires_at: Date.now() + ttl * 1000,
    };
    await this.redis.setEx(ModerationService.REDIS_TOKEN_KEY, JSON.stringify(cache), ttl);
    return data.access_token;
  }

  private async fetchImageBytes(imageUrl: string): Promise<Buffer> {
    const r = await this.http.get<ArrayBuffer>(imageUrl, { responseType: 'arraybuffer' });
    return Buffer.from(r.data);
  }

  // ===== 内部:落库 =====

  private async persistLog(args: {
    userId: bigint | null;
    scene: ModerationScene;
    contentHash: string;
    contentSnapshotUrl?: string;
    result: ModerationResult;
    reason: string | null;
    provider: string;
  }): Promise<{ id: bigint }> {
    const data: Prisma.ModerationLogCreateInput = {
      scene: args.scene,
      contentHash: args.contentHash,
      contentSnapshotUrl: args.contentSnapshotUrl ?? null,
      result: args.result,
      reason: args.reason ?? null,
      apiProvider: args.provider,
    };
    if (args.userId !== null) {
      data.user = { connect: { id: args.userId } };
    }
    const row = await this.prisma.moderationLog.create({
      data,
      select: { id: true },
    });
    return row;
  }

  // ===== 内部:工具 =====

  private mapSuggest(suggest: 'pass' | 'review' | 'risky' | undefined): ModerationResult {
    switch (suggest) {
      case 'pass':
        return ModerationResult.pass;
      case 'review':
        return ModerationResult.warn;
      case 'risky':
        return ModerationResult.block;
      default:
        return ModerationResult.pass;
    }
  }

  /**
   * 把 ModerationScene → 微信 scene 数值
   * 1 资料 / 2 评论 / 3 论坛 / 4 社交日志(默认走 2 评论)
   */
  private mapSceneToWechat(scene: ModerationScene): number {
    switch (scene) {
      case 'book_info':
        return 1;
      case 'photo':
      case 'ocr_text':
      case 'pdf_text':
      case 'pdf_cover':
        return 1;
      case 'answer':
        return 2;
      case 'ai_question':
      case 'ai_explanation':
        return 4;
      default:
        return 2;
    }
  }

  private summarizeReason(resp: WechatSecCheckResp): string | null {
    if (!resp.detail || resp.detail.length === 0) return resp.errmsg ?? null;
    const labels = resp.detail.map((d) => `${d.suggest}@${d.label ?? '-'}/${d.keyword ?? ''}`);
    return labels.join(';').slice(0, 250);
  }
}

// 让 ERROR_CODES 被引用(防止未使用警告)
export const _ERR = ERROR_CODES;
