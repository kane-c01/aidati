import { Controller, Get } from '@nestjs/common';

/**
 * 健康检查与版本信息控制器
 * 不挂在 /v1 前缀下, 便于 Nginx / k8s / 阿里云 SLB 直接探活
 * 接口契约见《03-API接口文档.md》§十三
 */
@Controller()
export class AppController {
  @Get('healthz')
  healthz(): { status: 'ok'; ts: string } {
    return {
      status: 'ok',
      ts: new Date().toISOString(),
    };
  }

  @Get('readyz')
  readyz(): { status: 'ok' | 'degraded'; deps: Record<string, string> } {
    // M1 起会真实检查 DB / Redis / Queue 连通性
    return {
      status: 'ok',
      deps: {
        db: 'pending',
        redis: 'pending',
        queue: 'pending',
      },
    };
  }

  @Get('version')
  version(): { version: string; commit: string; node: string } {
    return {
      version: process.env.APP_VERSION ?? '0.1.0',
      commit: process.env.GIT_COMMIT ?? 'dev',
      node: process.version,
    };
  }
}
