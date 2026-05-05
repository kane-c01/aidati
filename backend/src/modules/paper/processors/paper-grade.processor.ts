import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  type Answer,
  GradedBy,
  PaperStatus,
  type Prisma,
  type Question,
  QuestionType,
} from '@prisma/client';
import { type Job } from 'bullmq';

import { AiService } from '../../../infra/ai-service/ai-service.service';
import type { GradeAnswerItemDto } from '../../../infra/ai-service/ai-service.types';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { type PaperGradeJobData, QUEUE_PAPER_GRADE } from '../../../infra/queue/queue.constants';
import { MistakeService } from '../../mistake/mistake.service';

/**
 * 批改 Worker
 * 文档:01-技术架构 §4.2 / 03-API §7.6, §7.7
 *
 * 流程:
 * 1. 拉 paper + 所有 answer + question
 * 2. 拣出 short_answer 题目调 ai-service grade-paper(若没有主观题, 跳过 LLM)
 * 3. 用 grade 结果回写 Answer.aiFeedback / score / is_correct
 * 4. 标 paper.status=graded
 * 5. 遍历所有 answer:错的 → MistakeService.recordWrong;对的 → MistakeService.recordCorrect
 */
@Processor(QUEUE_PAPER_GRADE)
export class PaperGradeProcessor extends WorkerHost {
  private readonly logger = new Logger(PaperGradeProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly mistakes: MistakeService,
  ) {
    super();
  }

  async process(
    job: Job<PaperGradeJobData>,
  ): Promise<{ ok: true; subjective: number; mistakes: number }> {
    const paperId = BigInt(job.data.paper_id);
    const userId = BigInt(job.data.user_id);
    this.logger.log(`grade.start paper=${paperId}`);

    const paper = await this.prisma.paper.findUnique({
      where: { id: paperId },
      include: {
        questions: { orderBy: { orderNo: 'asc' } },
        answers: { where: { userId } },
      },
    });
    if (!paper) {
      throw new Error(`paper ${paperId} 不存在`);
    }
    if (paper.status === PaperStatus.graded) {
      this.logger.log(`grade.skip paper=${paperId} 已批改`);
      return { ok: true, subjective: 0, mistakes: 0 };
    }
    if (paper.status !== PaperStatus.submitted && paper.status !== PaperStatus.ready) {
      this.logger.warn(`grade.unexpected_status paper=${paperId} status=${paper.status}`);
    }

    const questionMap = new Map(paper.questions.map((q) => [q.id.toString(), q] as const));
    const answerMap = new Map(paper.answers.map((a) => [a.questionId.toString(), a] as const));

    // 1. 拣出主观题
    const subjectiveQs = paper.questions.filter((q) => q.type === QuestionType.short_answer);
    let subjectiveResults: Awaited<ReturnType<typeof this.gradeSubjective>> = [];
    if (subjectiveQs.length > 0) {
      try {
        subjectiveResults = await this.gradeSubjective(paper.id, userId, subjectiveQs, answerMap);
      } catch (err) {
        this.logger.error(`grade.subjective_failed paper=${paperId}: ${(err as Error).message}`);
        // 主观题批改失败 → 把 paper 标 failed?
        // 还是给出 0 分占位然后让用户申诉?对齐 PRD §7.4.4 选后者
        for (const q of subjectiveQs) {
          subjectiveResults.push({
            question_id: q.id.toString(),
            score: 0,
            is_correct: false,
            confidence: 0.5,
            feedback: 'AI 批改服务暂时不可用, 已先记 0 分, 用户可发起申诉。',
          });
        }
      }
    }

    // 2. 写回 answer
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    const now = new Date();
    for (const r of subjectiveResults) {
      const q = questionMap.get(r.question_id);
      if (!q) continue;
      writes.push(
        this.prisma.answer.upsert({
          where: {
            paperId_questionId_userId: { paperId, questionId: q.id, userId },
          },
          update: {
            score: r.score,
            isCorrect: r.is_correct ? 1 : 0,
            aiFeedback: r.feedback,
            aiConfidence: r.confidence,
            gradedBy: GradedBy.ai,
            gradedAt: now,
          },
          create: {
            paperId,
            questionId: q.id,
            userId,
            userAnswer: (answerMap.get(q.id.toString())?.userAnswer ??
              null) as Prisma.InputJsonValue,
            score: r.score,
            isCorrect: r.is_correct ? 1 : 0,
            aiFeedback: r.feedback,
            aiConfidence: r.confidence,
            gradedBy: GradedBy.ai,
            gradedAt: now,
          },
        }),
      );
    }
    writes.push(
      this.prisma.paper.update({
        where: { id: paperId },
        data: { status: PaperStatus.graded },
      }),
    );
    await this.prisma.$transaction(writes);

    // 3. 错题入库 / 重做计数
    const refreshed = await this.prisma.answer.findMany({
      where: { paperId, userId },
    });
    const refreshedById = new Map(refreshed.map((a) => [a.questionId.toString(), a] as const));

    let mistakeCount = 0;
    for (const q of paper.questions) {
      const a = refreshedById.get(q.id.toString());
      if (!a) continue;
      if (a.isCorrect === 0) {
        await this.mistakes.recordWrong({
          userId,
          question: q,
          bookId: paper.bookId ?? null,
        });
        mistakeCount++;
      } else if (a.isCorrect === 1) {
        // 重做对了:更新 consecutive_correct(已掌握的不动)
        await this.mistakes.recordCorrect({ userId, question: q });
      }
    }

    this.logger.log(
      `grade.ok paper=${paperId} subjective=${subjectiveResults.length} mistakes_added=${mistakeCount}`,
    );

    return { ok: true, subjective: subjectiveResults.length, mistakes: mistakeCount };
  }

  // ===== 内部 =====

  private async gradeSubjective(
    paperId: bigint,
    userId: bigint,
    subjectiveQs: Question[],
    answerMap: Map<string, Answer>,
  ): Promise<
    Array<{
      question_id: string;
      score: number;
      is_correct: boolean;
      confidence: number;
      feedback: string;
      suggestions?: string | null;
    }>
  > {
    const items: GradeAnswerItemDto[] = subjectiveQs.map((q) => {
      const a = answerMap.get(q.id.toString());
      return {
        question_id: q.id.toString(),
        stem: q.stem,
        reference_answer: this.referenceAnswerOf(q),
        knowledge_points: ((q.knowledgePoints as string[] | null) ?? []).filter(
          (s) => typeof s === 'string',
        ),
        user_answer: this.userAnswerString(a?.userAnswer),
        full_score: q.score,
      };
    });

    const resp = await this.aiService.gradePaper({
      paper_id: paperId.toString(),
      user_id: userId.toString(),
      items,
    });

    return resp.results.map((r) => ({
      question_id: r.question_id,
      score: r.score,
      is_correct: r.is_correct,
      confidence: Number(r.confidence ?? 0.8),
      feedback: r.feedback,
      suggestions: r.suggestions ?? null,
    }));
  }

  private referenceAnswerOf(q: Question): string {
    const ans = q.correctAnswer;
    if (typeof ans === 'string') return ans;
    if (Array.isArray(ans)) return ans.map(String).join('\n');
    if (ans && typeof ans === 'object') return JSON.stringify(ans);
    return '';
  }

  private userAnswerString(userAnswer: unknown): string {
    if (typeof userAnswer === 'string') return userAnswer;
    if (userAnswer === null || userAnswer === undefined) return '';
    if (Array.isArray(userAnswer)) return userAnswer.map(String).join('\n');
    return JSON.stringify(userAnswer);
  }
}
