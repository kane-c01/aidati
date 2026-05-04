import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const host = configService.get<string>('HOST', '0.0.0.0');

  // 业务接口统一前缀 /v1, 健康检查不带前缀(便于 Nginx / k8s 探针直连)
  app.setGlobalPrefix('v1', {
    exclude: ['/healthz', '/readyz', '/version', '/metrics'],
  });

  app.enableShutdownHooks();

  await app.listen(port, host);
  const url = await app.getUrl();
  Logger.log(`🚀 业务后端启动成功:${url}/v1`, 'Bootstrap');
  Logger.log(`💚 健康检查:${url}/healthz`, 'Bootstrap');
}

bootstrap().catch((err) => {
  Logger.error('启动失败', err, 'Bootstrap');
  process.exit(1);
});
