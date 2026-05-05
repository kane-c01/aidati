import { Global, Module } from '@nestjs/common';

import { QuotaService } from './quota.service';

/**
 * 配额模块 - 标 Global, 业务模块直接注入即可
 */
@Global()
@Module({
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
