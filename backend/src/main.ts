import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { patchBigIntJson } from './common/utils/bigint';

async function bootstrap(): Promise<void> {
  // BigInt → string 必须在任何 JSON.stringify 调用前打补丁(03-API §1.6)
  patchBigIntJson();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const host = configService.get<string>('HOST', '0.0.0.0');

  // /v1 前缀;健康检查/版本/Prom 指标不带前缀, 便于探针直连(05 §2.5)
  app.setGlobalPrefix('v1', {
    exclude: ['/healthz', '/readyz', '/version', '/metrics'],
  });

  // 隐藏 Express 默认 X-Powered-By 头(05 §7.5)
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // CORS:小程序请求由微信容器发, 一般不会触发 CORS;Web 管理后台需要
  // 生产域名通过 ENV 注入, 默认开发开放任意来源
  const corsOriginsRaw = configService.get<string>('CORS_ORIGINS', '*');
  const origins =
    corsOriginsRaw === '*'
      ? true
      : corsOriginsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
  app.enableCors({
    origin: origins,
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  });

  app.enableShutdownHooks();

  await app.listen(port, host);
  const url = await app.getUrl();
  Logger.log(`🚀 业务后端启动成功:${url}/v1`, 'Bootstrap');
  Logger.log(`💚 健康检查:${url}/healthz`, 'Bootstrap');
  Logger.log(`📦 版本:${configService.get('APP_VERSION', '0.1.0')}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  Logger.error('启动失败', err, 'Bootstrap');
  process.exit(1);
});
