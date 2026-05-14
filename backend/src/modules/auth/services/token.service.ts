import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { nanoid } from 'nanoid';

import { UnauthorizedBusinessException } from '../../../common/exceptions/business.exception';
import type { JwtPayload, UserRoleName } from '../../../common/types/auth.types';
import { RedisService } from '../../../infra/redis/redis.service';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface SignArgs {
  userId: bigint;
  openid: string | null;
  role: UserRoleName;
}

/**
 * Token 服务
 * 文档:01-技术架构文档.md §5.1
 *
 * 设计要点:
 * - access_token 7d (HS256, type=access)
 * - refresh_token 30d (HS256, type=refresh) + Redis 白名单, 仅在白名单内的 refresh 可换 access
 * - 登出时:删除 refresh 白名单 + 把 access jti 加入黑名单(直到自然过期)
 * - jwt.strategy.validate() 中校验 access jti 不在黑名单
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresSec: number;
  private readonly refreshExpiresSec: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.accessSecret = config.getOrThrow<string>('JWT_SECRET');
    this.refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessExpiresSec = parseDurationSec(config.get<string>('JWT_EXPIRES_IN', '7d'));
    this.refreshExpiresSec = parseDurationSec(config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d'));
  }

  /**
   * 签发一对 token, 同时把 refresh 写入 Redis 白名单
   */
  async sign({ userId, openid, role }: SignArgs): Promise<TokenPair> {
    const sub = userId.toString();
    const accessJti = nanoid(16);
    const refreshJti = nanoid(16);

    const accessPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub,
      openid,
      role,
      jti: accessJti,
      type: 'access',
    };
    const refreshPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub,
      openid,
      role,
      jti: refreshJti,
      type: 'refresh',
    };

    const access_token = await this.jwt.signAsync(accessPayload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiresSec,
    });
    const refresh_token = await this.jwt.signAsync(refreshPayload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiresSec,
    });

    // refresh 白名单, 用 jti 作为 key, value 是 user_id, 与 token TTL 同步
    await this.redis.setEx(`refresh:${refreshJti}`, sub, this.refreshExpiresSec);

    return {
      access_token,
      refresh_token,
      expires_in: this.accessExpiresSec,
    };
  }

  /**
   * 校验 refresh_token, 通过则旋转 (revoke 旧 refresh, 签发新 pair)
   */
  async rotate(refreshToken: string): Promise<TokenPair & { sub: string }> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.refreshSecret,
      });
    } catch (err) {
      throw new UnauthorizedBusinessException(
        err instanceof Error ? `refresh token 无效: ${err.message}` : 'refresh token 无效',
      );
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedBusinessException('token 类型不匹配');
    }

    // 白名单校验
    const cached = await this.redis.client.get(`refresh:${payload.jti}`);
    if (!cached || cached !== payload.sub) {
      throw new UnauthorizedBusinessException('refresh token 已被撤销');
    }

    // 旋转:删除旧 refresh
    await this.redis.client.del(`refresh:${payload.jti}`);

    const newPair = await this.sign({
      userId: BigInt(payload.sub),
      openid: payload.openid,
      role: payload.role,
    });

    return { ...newPair, sub: payload.sub };
  }

  /**
   * 登出 - 撤销当前 access(加黑名单到自然过期) + 删除 refresh 白名单
   */
  async revoke(accessJti: string, accessExp: number, refreshJti?: string): Promise<void> {
    const ttl = Math.max(1, accessExp - Math.floor(Date.now() / 1000));
    await this.redis.setEx(`revoked:access:${accessJti}`, '1', ttl);
    if (refreshJti) {
      await this.redis.client.del(`refresh:${refreshJti}`);
    }
  }

  /**
   * 检查 access jti 是否在黑名单(jwt.strategy 调用)
   */
  async isAccessRevoked(jti: string): Promise<boolean> {
    const exists = await this.redis.client.exists(`revoked:access:${jti}`);
    return exists === 1;
  }
}

/**
 * 把 "7d" / "30d" / "1h" / "604800" 转成秒
 * 简化实现, 仅识别 d/h/m/s 后缀和纯数字
 */
function parseDurationSec(input: string): number {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const m = trimmed.match(/^(\d+)([dhms])$/i);
  if (!m) throw new Error(`无法解析 JWT 过期时间: ${input}`);
  const n = parseInt(m[1], 10);
  switch (m[2].toLowerCase()) {
    case 'd':
      return n * 86400;
    case 'h':
      return n * 3600;
    case 'm':
      return n * 60;
    case 's':
      return n;
    default:
      throw new Error(`未知时间单位: ${m[2]}`);
  }
}
