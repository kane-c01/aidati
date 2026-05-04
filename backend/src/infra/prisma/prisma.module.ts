import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Prisma 全局模块
 * 标 @Global 后, 业务模块直接 inject PrismaService 即可, 无需重复 imports
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
