import { Module } from '@nestjs/common';

import { MistakeModule } from '../mistake/mistake.module';

import { PaperController } from './paper.controller';
import { PaperService } from './paper.service';
import { PaperGenerateProcessor } from './processors/paper-generate.processor';
import { PaperGradeProcessor } from './processors/paper-grade.processor';
import { AnswerGraderService } from './services/answer-grader.service';
import { ContextBuilderService } from './services/context-builder.service';

/**
 * 试卷模块 - M3 主线
 *
 * Controller: HTTP 入口
 * Service:    业务编排(创建/查询/取消/草稿/提交/结果)
 * Processors: BullMQ 异步消费(出题 / 批改)
 * 内部子服务:
 *   - ContextBuilderService 拼出题上下文
 *   - AnswerGraderService   客观题本地批改
 *
 * 全局依赖(自动注入):
 *   - PrismaService (PrismaModule)
 *   - RedisService  (RedisModule)
 *   - QuotaService  (QuotaModule)
 *   - AiService     (AiServiceModule)
 *   - 队列          (QueueModule, BullMQ)
 */
@Module({
  imports: [MistakeModule],
  controllers: [PaperController],
  providers: [
    PaperService,
    ContextBuilderService,
    AnswerGraderService,
    PaperGenerateProcessor,
    PaperGradeProcessor,
  ],
  exports: [PaperService, AnswerGraderService],
})
export class PaperModule {}
