import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job } from 'bullmq';
import {
  type Prisma,
  ModerationScene,
  PaperStatus,
  QuestionType,
  DifficultyLevel,
} from '@prisma/client';

import { sha256 } from '../../../common/utils/sha256';
import { AiService } from '../../../infra/ai-service/ai-service.service';
import type {
  GeneratedQuestion,
  QuestionType as RpcQuestionType,
} from '../../../infra/ai-service/ai-service.types';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import {
  type PaperGenerateJobData,
  QUEUE_PAPER_GENERATE,
} from '../../../infra/queue/queue.constants';
import { ModerationService } from '../../moderation/moderation.service';
import { QuotaService } from '../../quota/quota.service';
import { ContextBuilderService } from '../services/context-builder.service';

/**
 * 出题 Worker
 * 文档:01-技术架构 §4.1
 *
 * 流程:
 *   pull paper → 校验 status=generating(被取消则跳过)
 *      → ContextBuilder 拼上下文
 *      → AiService.generatePaper(LLMChain 主备, 内含 mock 兜底)
 *      → 写 Question 表 + paper.status=ready
 *
 * 任意步骤异常 → paper.status=failed, 退还配额, 不再重试(BullMQ retry 由 default 配置控制)
 */
@Processor(QUEUE_PAPER_GENERATE)
export class PaperGenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(PaperGenerateProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contextBuilder: ContextBuilderService,
    private readonly aiService: AiService,
    private readonly quota: QuotaService,
    private readonly moderation: ModerationService,
  ) {
    super();
  }

  async process(job: Job<PaperGenerateJobData>): Promise<{ ok: true; total: number }> {
    const paperId = BigInt(job.data.paper_id);
    const userId = BigInt(job.data.user_id);
    this.logger.log(`generate.start paper=${paperId}`);

    const paper = await this.prisma.paper.findUnique({ where: { id: paperId } });
    if (!paper) {
      throw new Error(`paper ${paperId} 不存在`);
    }
    if (paper.status !== PaperStatus.generating) {
      this.logger.log(`generate.skip paper=${paperId} status=${paper.status}`);
      return { ok: true, total: 0 };
    }
    const config = paper.config as {
      question_types: RpcQuestionType[];
      difficulty: 'easy' | 'medium' | 'hard';
      count: number;
      custom_prompt: string | null;
    };

    try {
      const ctx = await this.contextBuilder.buildForPaper(paper);

      // 内容安全(M6):context_text 与 custom_prompt 都要过审, 任何一段命中即整体 block
      // 拍照集场景的 OCR 文本已经在写回时过审一次, 这里再做一次"出题边界"再保护
      await this.moderation.checkOrThrow({
        scene: ModerationScene.book_info,
        userId,
        text: ctx.context_text.slice(0, 5000),
      });
      const customPrompt = typeof config.custom_prompt === 'string' ? config.custom_prompt : null;
      if (customPrompt && customPrompt.trim().length > 0) {
        await this.moderation.checkOrThrow({
          scene: ModerationScene.ai_question,
          userId,
          text: customPrompt,
        });
      }

      const resp = await this.aiService.generatePaper({
        paper_id: paper.id.toString(),
        user_id: userId.toString(),
        source_type: paper.sourceType,
        config: {
          question_types: config.question_types,
          difficulty: config.difficulty,
          count: config.count,
          custom_prompt: config.custom_prompt,
        },
        context_text: ctx.context_text,
        book_title: ctx.book_title,
        chapter_titles: ctx.chapter_titles,
      });

      // 落库 question 表
      const cost = new Prisma_DecimalLikeCost(resp.usage.cost_yuan);
      await this.prisma.$transaction(async (tx) => {
        // 清空可能的残留(重试场景)
        await tx.question.deleteMany({ where: { paperId: paper.id } });

        await tx.question.createMany({
          data: resp.questions.map((q) => this.toQuestionCreate(paper.id, q)),
        });

        await tx.paper.update({
          where: { id: paper.id },
          data: {
            status: PaperStatus.ready,
            totalQuestions: resp.questions.length,
            llmModel: resp.usage.model,
            llmTokensInput: resp.usage.tokens_input,
            llmTokensOutput: resp.usage.tokens_output,
            llmCost: cost.toPrismaDecimal(),
          },
        });
      });

      this.logger.log(
        `generate.ok paper=${paper.id} model=${resp.usage.model} n=${resp.questions.length} cost=¥${resp.usage.cost_yuan}`,
      );
      return { ok: true, total: resp.questions.length };
    } catch (err) {
      this.logger.error(`generate.failed paper=${paper.id}: ${(err as Error).message}`);
      await this.prisma.paper.update({
        where: { id: paper.id },
        data: { status: PaperStatus.failed },
      });
      // 出题失败要退还配额
      await this.quota
        .refund(userId, 'generate_failed')
        .catch((e) => this.logger.warn(`配额退还失败: ${(e as Error).message}`));
      throw err; // BullMQ 标失败
    }
  }

  // ===== 工具 =====

  private toQuestionCreate(paperId: bigint, q: GeneratedQuestion): Prisma.QuestionCreateManyInput {
    const stemHash = sha256(`${q.type}:${q.stem.replace(/\s+/g, '').trim()}`);
    return {
      paperId,
      orderNo: q.order_no,
      type: this.mapType(q.type),
      difficulty: this.mapDifficulty(q.difficulty),
      stem: q.stem,
      options: (q.options ?? null) as unknown as Prisma.InputJsonValue,
      correctAnswer: q.correct_answer as unknown as Prisma.InputJsonValue,
      explanation: q.explanation,
      knowledgePoints: (q.knowledge_points ?? []) as unknown as Prisma.InputJsonValue,
      stemHash,
      score: q.score ?? 10,
    };
  }

  private mapType(t: RpcQuestionType): QuestionType {
    return t as unknown as QuestionType;
  }

  private mapDifficulty(d: 'easy' | 'medium' | 'hard'): DifficultyLevel {
    return d as unknown as DifficultyLevel;
  }
}

/** 极简 Decimal 构造器 - 避免直接 import Prisma 大依赖 */
class Prisma_DecimalLikeCost {
  constructor(private readonly value: number) {}
  toPrismaDecimal(): Prisma.Decimal | number {
    // Prisma 接受 number / string, 写库后会转 Decimal
    return Math.round(this.value * 10000) / 10000;
  }
}
