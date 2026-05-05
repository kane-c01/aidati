import { Module } from '@nestjs/common';

import { MistakeService } from './mistake.service';

/**
 * 错题本模块
 *
 * M3:仅暴露 service 给 paper grade 流程联动
 * M4:加入 controller(列表 / master / unmaster / practice / delete)
 */
@Module({
  providers: [MistakeService],
  exports: [MistakeService],
})
export class MistakeModule {}
