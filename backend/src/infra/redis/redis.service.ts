import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { type RedisOptions } from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Redis 客户端单例
 * 用法:`constructor(private readonly redis: RedisService) {}`
 * 然后调用 `redis.client.get(key)` 等原生 API
 *
 * 也提供常用快捷方法 setEx / incrEx / withLock 简化调用方
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public readonly client: Redis;
  private readonly prefix: string;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const url = configService.getOrThrow<string>('REDIS_URL');
    this.prefix = configService.get<string>('REDIS_PREFIX', 'ai-quiz:dev:');

    const options: RedisOptions = {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      keyPrefix: this.prefix,
    };

    this.client = new Redis(url, options);

    this.client.on('connect', () => this.logger.log(`Redis connected, prefix=${this.prefix}`));
    this.client.on('error', (err) => this.logger.error('Redis error', err));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    this.logger.log('Redis disconnected');
  }

  /** 健康检查(SELECT 1 等价物) */
  async healthCheck(): Promise<boolean> {
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch (err) {
      this.logger.error('Redis healthCheck failed', err as Error);
      return false;
    }
  }

  /**
   * SET key value EX ttl
   * @param ttlSeconds 过期时间(秒)
   */
  async setEx(key: string, value: string, ttlSeconds: number): Promise<'OK' | null> {
    return this.client.set(key, value, 'EX', ttlSeconds);
  }

  /**
   * 原子 +1 并设置过期(用于配额、限流)
   * 第一次调用时设置过期, 后续调用不重置 TTL
   */
  async incrEx(key: string, ttlSeconds: number): Promise<number> {
    const pipeline = this.client.multi();
    pipeline.incr(key);
    pipeline.expire(key, ttlSeconds, 'NX');
    const results = await pipeline.exec();
    if (!results || results.length === 0) {
      throw new Error('Redis incrEx pipeline returned no result');
    }
    const [err, value] = results[0] ?? [null, 0];
    if (err) throw err;
    return Number(value);
  }

  /**
   * 简单分布式锁(SET NX EX)
   * @returns 拿到锁返回 token, 否则返回 null
   */
  async tryLock(key: string, ttlSeconds: number): Promise<string | null> {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ok = await this.client.set(key, token, 'EX', ttlSeconds, 'NX');
    return ok === 'OK' ? token : null;
  }

  /**
   * 释放锁(必须用 Lua 脚本保证原子性, 仅当 token 匹配才释放)
   */
  async releaseLock(key: string, token: string): Promise<boolean> {
    const lua = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`;
    const result = (await this.client.eval(lua, 1, key, token)) as number;
    return result === 1;
  }
}
