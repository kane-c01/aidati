import { type MiddlewareConsumer, Module, type NestModule, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { LoggerInterceptor } from './common/interceptors/logger.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AiServiceModule } from './infra/ai-service/ai-service.module';
import { HealthModule } from './infra/health/health.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { QueueModule } from './infra/queue/queue.module';
import { RedisModule } from './infra/redis/redis.module';
import { StorageModule } from './infra/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { BookModule } from './modules/book/book.module';
import { MistakeModule } from './modules/mistake/mistake.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { PaperModule } from './modules/paper/paper.module';
import { PhotoModule } from './modules/photo/photo.module';
import { QuotaModule } from './modules/quota/quota.module';
import { UploadModule } from './modules/upload/upload.module';
import { UserModule } from './modules/user/user.module';

/**
 * 应用根模块
 * 文档:01-技术架构文档.md §3 / 03-API §一
 *
 * - 全局过滤器:AllExceptionsFilter(统一错误响应)
 * - 全局拦截器:LoggerInterceptor(请求日志)→ ResponseInterceptor(包裹 + BigInt 序列化)
 * - 全局守卫:JwtAuthGuard(默认认证, @Public() 跳过)→ RolesGuard
 * - 全局管道:ValidationPipe(class-validator 校验 DTO)
 * - 全局中间件:RequestIdMiddleware(挂 X-Request-Id)
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.development'],
    }),
    PrismaModule,
    RedisModule,
    StorageModule,
    QueueModule,
    AiServiceModule,
    ModerationModule,
    QuotaModule,
    HealthModule,
    AuthModule,
    UserModule,
    UploadModule,
    PhotoModule,
    BookModule,
    MistakeModule,
    PaperModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    // 拦截器执行顺序:数组顺序 = 注册顺序 = 「外 → 内」
    // Logger 包在最外层(才能记录最终响应耗时), Response 包内层(确保返回值已经成业务数据)
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggerInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    // 守卫顺序:JwtAuth → Roles
    // JwtAuthGuard 把 user 注入 req, RolesGuard 才能读
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: false,
          transform: true,
          transformOptions: { enableImplicitConversion: false },
        }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
