import { Controller, Get } from '@nestjs/common';

import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * 健康检查 / 版本信息控制器
 * 文档:开发文档/03-API接口文档.md §十三
 *
 * 不挂在 /v1 前缀下, 便于 Nginx / k8s / SLB 直接探活
 * 全部接口标 @Public(), 跳过 JWT 校验
 */
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('healthz')
  healthz(): { status: 'ok'; ts: string } {
    return {
      status: 'ok',
      ts: new Date().toISOString(),
    };
  }

  @Public()
  @Get('readyz')
  async readyz(): Promise<{
    status: 'ok' | 'degraded';
    deps: Record<string, 'ok' | 'fail'>;
  }> {
    const [db, redis] = await Promise.all([this.prisma.healthCheck(), this.redis.healthCheck()]);

    const status = db && redis ? 'ok' : 'degraded';
    return {
      status,
      deps: {
        db: db ? 'ok' : 'fail',
        redis: redis ? 'ok' : 'fail',
        queue: 'ok',
      },
    };
  }

  @Public()
  @Get('version')
  version(): { version: string; commit: string; node: string } {
    return {
      version: process.env.APP_VERSION ?? '0.1.0',
      commit: process.env.GIT_COMMIT ?? 'dev',
      node: process.version,
    };
  }
}
