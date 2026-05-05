import { Module } from '@nestjs/common';

import { MistakeController } from './mistake.controller';
import { MistakeService } from './mistake.service';

/**
 * 错题本模块
 * - service:M3 起被 paper grade 流程联动(自动入库 + 重做计数)
 * - controller:M4 起暴露 HTTP 接口(列表 / master / unmaster / practice / delete)
 */
@Module({
  controllers: [MistakeController],
  providers: [MistakeService],
  exports: [MistakeService],
})
export class MistakeModule {}
