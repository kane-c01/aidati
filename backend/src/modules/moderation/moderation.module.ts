import { Global, Module } from '@nestjs/common';

import { ModerationService } from './moderation.service';

/**
 * 内容安全模块 — 标 Global, 让 photo / paper / feedback / OCR 等钉点直接 inject
 */
@Global()
@Module({
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
