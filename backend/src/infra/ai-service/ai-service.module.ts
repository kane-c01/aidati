import { Global, Module } from '@nestjs/common';

import { AiService } from './ai-service.service';
import { LlmRuntimeService } from './llm-runtime.service';
import { VisionRuntimeService } from './vision-runtime.service';

/**
 * AI 编排服务客户端模块
 * 文档:01-技术架构 §3.2
 *
 * 标 @Global, 任何模块都可以直接 inject AiService
 */
@Global()
@Module({
  providers: [AiService, LlmRuntimeService, VisionRuntimeService],
  exports: [AiService, LlmRuntimeService, VisionRuntimeService],
})
export class AiServiceModule {}
