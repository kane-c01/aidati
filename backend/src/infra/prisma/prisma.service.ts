import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma 单例服务
 * - 启动 / 关闭 hooks 接 NestJS 生命周期
 * - 提供 healthCheck() 给 /readyz 用
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected to MySQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }

  /**
   * 健康检查 - 由 /readyz 调用
   * 用最便宜的查询 SELECT 1 验证连通性
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRawUnsafe('SELECT 1');
      return true;
    } catch (err) {
      this.logger.error('Prisma healthCheck failed', err as Error);
      return false;
    }
  }
}
