import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { QUEUE_PAPER_GENERATE, QUEUE_PAPER_GRADE } from './queue.constants';

/**
 * BullMQ 队列基础设施
 * 文档:01-技术架构 §3.3
 *
 * - paper-generate 高优先级, ≤ 30s 完成
 * - paper-grade    高优先级, ≤ 30s 完成
 *
 * 与业务后端共享同一 Redis 实例(已由 RedisService 启动);
 * BullMQ 用单独的 connection(避免与缓存的 keyPrefix 冲突)
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          // 单独从 REDIS_URL 解析, 不带 keyPrefix(BullMQ 自己有 namespace)
          url: config.getOrThrow<string>('REDIS_URL'),
        },
        prefix: config.get<string>('QUEUE_PREFIX', 'ai-quiz:queue:dev'),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          // 完成 / 失败的 job 默认仅保留近 100 条做排错
          removeOnComplete: { age: 3600, count: 100 },
          removeOnFail: { age: 24 * 3600, count: 200 },
        },
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_PAPER_GENERATE }, { name: QUEUE_PAPER_GRADE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
