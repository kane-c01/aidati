import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  GradedBy,
  type Answer,
  type Paper,
  PaperSourceType,
  PaperStatus,
  type Prisma,
  type Question,
  QuestionType,
  UserRole,
} from '@prisma/client';
import { Queue } from 'bullmq';

import { ERROR_CODES } from '../../common/constants/error-codes';
import {
  BusinessException,
  NotFoundBusinessException,
} from '../../common/exceptions/business.exception';
import { sha256 } from '../../common/utils/sha256';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  type PaperGenerateJobData,
  type PaperGradeJobData,
  QUEUE_PAPER_GENERATE,
  QUEUE_PAPER_GRADE,
} from '../../infra/queue/queue.constants';
import { QuotaService } from '../quota/quota.service';

import type { CreatePaperDto } from './dto/create-paper.dto';
import type { SaveDraftDto } from './dto/save-draft.dto';
import type { SubmitAnswersDto } from './dto/submit-answers.dto';
import { AnswerGraderService } from './services/answer-grader.service';

/** PRD §7.3:30s 内取消不扣额度 */
const CANCEL_GRACE_MS = 30_000;

export interface PaperBriefView {
  id: string;
  status: PaperStatus;
  source_type: PaperSourceType;
  total_questions: number;
  estimated_seconds?: number;
  created_at: string;
}

export interface PaperView extends PaperBriefView {
  config: unknown;
  book_id: string | null;
  chapter_id: string | null;
  photo_set_id: string | null;
  /** status >= ready 时才返回 */
  questions?: QuestionView[];
}

export interface QuestionView {
  id: string;
  order_no: number;
  type: QuestionType;
  difficulty: string;
  stem: string;
  options: unknown;
  score: number;
  /** 仅 graded 后 / paper.status=graded 才返回 */
  correct_answer?: unknown;
  explanation?: string;
  knowledge_points?: unknown;
}

export interface AnswerView {
  question_id: string;
  user_answer: unknown;
  is_correct: boolean | null;
  score: number | null;
  ai_feedback: string | null;
  ai_confidence: number | null;
  graded_by: GradedBy | null;
  time_spent_sec: number | null;
}

export interface PaperResultItem {
  id: string;
  order_no: number;
  type: QuestionType;
  difficulty: string;
  stem: string;
  options: unknown;
  /** 该题满分(question.score) */
  full_score: number;
  correct_answer: unknown;
  explanation: string | null;
  knowledge_points: unknown;
  user_answer: unknown;
  is_correct: boolean | null;
  /** 用户获得分数 */
  score: number | null;
  ai_feedback: string | null;
  ai_confidence: number | null;
  graded_by: GradedBy | null;
  time_spent_sec: number | null;
}

export interface PaperResultView {
  paper_id: string;
  status: PaperStatus;
  summary: {
    total_score: number;
    max_score: number;
    accuracy: number;
    time_spent_sec: number | null;
  };
  questions: PaperResultItem[];
}

@Injectable()
export class PaperService {
  private readonly logger = new Logger(PaperService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    private readonly grader: AnswerGraderService,
    @InjectQueue(QUEUE_PAPER_GENERATE) private readonly generateQueue: Queue<PaperGenerateJobData>,
    @InjectQueue(QUEUE_PAPER_GRADE) private readonly gradeQueue: Queue<PaperGradeJobData>,
  ) {}

  // ============ 创建 ============

  /**
   * POST /v1/papers
   * 文档:03-API §7.1
   *
   * @param idempotencyKey 客户端 Header 里的 Idempotency-Key
   */
  async createPaper(
    userId: bigint,
    role: UserRole,
    dto: CreatePaperDto,
    idempotencyKey?: string,
  ): Promise<{ paper_id: string; status: PaperStatus; estimated_seconds: number }> {
    // 1. 幂等键命中:返回已有 paper
    if (idempotencyKey) {
      const existing = await this.prisma.paper.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        if (existing.userId !== userId) {
          throw new BusinessException(ERROR_CODES.PARAM_INVALID, 'Idempotency-Key 与他人冲突');
        }
        this.logger.log(`createPaper idempotent hit user=${userId} paper=${existing.id}`);
        return {
          paper_id: existing.id.toString(),
          status: existing.status,
          estimated_seconds: this.estimateSeconds(existing.totalQuestions || dto.config.count),
        };
      }
    }

    // 2. 校验素材是否存在 + 归属 / 过期
    const { bookId, chapterId, photoSetId, extraChapterIds } = await this.validateSource(
      userId,
      dto,
    );

    // 3. 配额检查并占用(超额抛 30001)
    await this.quota.checkAndConsume(userId, role);

    // 4. 创建 paper 行
    let paper: Paper;
    try {
      const config: Prisma.InputJsonValue = {
        question_types: dto.config.question_types,
        difficulty: dto.config.difficulty,
        count: dto.config.count,
        custom_prompt: dto.config.custom_prompt ?? null,
        ...(extraChapterIds.length > 0 ? { extra_chapter_ids: extraChapterIds } : {}),
      };
      paper = await this.prisma.paper.create({
        data: {
          userId,
          sourceType: this.toEnumSource(dto.source_type),
          bookId,
          chapterId,
          photoSetId,
          config,
          status: PaperStatus.generating,
          totalQuestions: 0,
          idempotencyKey: idempotencyKey ?? null,
        },
      });
    } catch (err) {
      // 写库失败要把刚才占的配额吐回来
      await this.quota.refund(userId, 'create_paper_db_failed');
      throw err;
    }

    // 5. 入队;若入队失败要把 paper 标 failed + 退还配额
    try {
      await this.generateQueue.add(
        'generate',
        {
          paper_id: paper.id.toString(),
          user_id: userId.toString(),
        },
        {
          jobId: `paper-gen-${paper.id.toString()}`,
          priority: 1,
        },
      );
    } catch (err) {
      this.logger.error(`generate.queue 入队失败 paper=${paper.id}: ${(err as Error).message}`);
      await this.prisma.paper.update({
        where: { id: paper.id },
        data: { status: PaperStatus.failed },
      });
      await this.quota.refund(userId, 'queue_add_failed');
      throw err;
    }

    const estimated = this.estimateSeconds(dto.config.count);
    this.logger.log(
      `createPaper user=${userId} paper=${paper.id} src=${dto.source_type} count=${dto.config.count}`,
    );
    return {
      paper_id: paper.id.toString(),
      status: paper.status,
      estimated_seconds: estimated,
    };
  }

  // ============ 查询 ============

  async getPaper(userId: bigint, paperId: bigint, includeAnswers = false): Promise<PaperView> {
    const paper = await this.prisma.paper.findUnique({
      where: { id: paperId },
      include: {
        questions: {
          orderBy: { orderNo: 'asc' },
        },
      },
    });
    if (!paper || paper.userId !== userId) {
      throw new NotFoundBusinessException('试卷不存在');
    }

    const showAnswers = paper.status === PaperStatus.graded;
    const questions: QuestionView[] | undefined =
      paper.status === PaperStatus.generating
        ? undefined
        : paper.questions.map((q) => this.toQuestionView(q, showAnswers));

    return {
      id: paper.id.toString(),
      status: paper.status,
      source_type: paper.sourceType,
      total_questions: paper.totalQuestions,
      created_at: paper.createdAt.toISOString(),
      config: paper.config,
      book_id: paper.bookId?.toString() ?? null,
      chapter_id: paper.chapterId?.toString() ?? null,
      photo_set_id: paper.photoSetId?.toString() ?? null,
      questions: includeAnswers ? questions : questions?.map((q) => ({ ...q })),
      estimated_seconds:
        paper.status === PaperStatus.generating
          ? this.estimateSeconds(this.configCount(paper.config))
          : undefined,
    };
  }

  // ============ 取消 ============

  /**
   * POST /v1/papers/{id}/cancel
   * 30s 内取消不扣额度
   */
  async cancelPaper(userId: bigint, paperId: bigint): Promise<{ ok: true; refunded: boolean }> {
    const paper = await this.findOwnedPaper(userId, paperId);

    if (paper.status !== PaperStatus.generating) {
      throw new BusinessException(
        ERROR_CODES.PARAM_INVALID,
        `仅在 generating 状态可取消, 当前 ${paper.status}`,
      );
    }

    const elapsed = Date.now() - paper.createdAt.getTime();
    const withinGrace = elapsed <= CANCEL_GRACE_MS;

    await this.prisma.paper.update({
      where: { id: paper.id },
      data: { status: PaperStatus.failed },
    });

    if (withinGrace) {
      await this.quota.refund(userId, 'paper_cancel_within_grace');
    }

    // 尝试取消队列任务(若已在执行则 BullMQ 仍会跑完, worker 自己再判 status)
    try {
      const job = await this.generateQueue.getJob(`paper-gen-${paper.id.toString()}`);
      if (job) {
        await job.remove();
      }
    } catch (err) {
      this.logger.warn(`取消队列任务失败 paper=${paper.id}: ${(err as Error).message}`);
    }

    this.logger.log(
      `cancelPaper user=${userId} paper=${paper.id} elapsed=${elapsed}ms refunded=${withinGrace}`,
    );

    return { ok: true, refunded: withinGrace };
  }

  // ============ 草稿 ============

  async saveDraft(userId: bigint, paperId: bigint, dto: SaveDraftDto): Promise<{ saved: number }> {
    const paper = await this.findOwnedPaper(userId, paperId);
    if (paper.status !== PaperStatus.ready) {
      throw new BusinessException(
        ERROR_CODES.PARAM_INVALID,
        `仅 ready 状态可暂存, 当前 ${paper.status}`,
      );
    }

    const questions = await this.prisma.question.findMany({
      where: { paperId, id: { in: dto.answers.map((a) => BigInt(a.question_id)) } },
      select: { id: true },
    });
    const owned = new Set(questions.map((q) => q.id.toString()));
    for (const a of dto.answers) {
      if (!owned.has(a.question_id)) {
        throw new BusinessException(
          ERROR_CODES.PARAM_INVALID,
          `question_id=${a.question_id} 不属于该试卷`,
        );
      }
    }

    await this.prisma.$transaction(
      dto.answers.map((a) =>
        this.prisma.answer.upsert({
          where: {
            paperId_questionId_userId: {
              paperId,
              questionId: BigInt(a.question_id),
              userId,
            },
          },
          update: {
            userAnswer: a.user_answer as Prisma.InputJsonValue,
            timeSpentSec: a.time_spent_sec ?? null,
          },
          create: {
            paperId,
            questionId: BigInt(a.question_id),
            userId,
            userAnswer: a.user_answer as Prisma.InputJsonValue,
            timeSpentSec: a.time_spent_sec ?? null,
          },
        }),
      ),
    );

    return { saved: dto.answers.length };
  }

  async getDraft(userId: bigint, paperId: bigint): Promise<{ answers: AnswerView[] }> {
    await this.findOwnedPaper(userId, paperId);
    const answers = await this.prisma.answer.findMany({
      where: { paperId, userId },
    });
    return { answers: answers.map((a) => this.toAnswerView(a)) };
  }

  // ============ 提交 ============

  /**
   * POST /v1/papers/{id}/submit
   * 客观题立刻批, 主观题入队
   */
  async submitPaper(
    userId: bigint,
    paperId: bigint,
    dto: SubmitAnswersDto,
  ): Promise<{ paper_id: string; status: PaperStatus; estimated_seconds: number }> {
    const paper = await this.prisma.paper.findUnique({
      where: { id: paperId },
      include: { questions: { orderBy: { orderNo: 'asc' } } },
    });
    if (!paper || paper.userId !== userId) {
      throw new NotFoundBusinessException('试卷不存在');
    }
    if (paper.status === PaperStatus.submitted || paper.status === PaperStatus.graded) {
      // 幂等:已提交 / 已批 → 直接返回当前状态
      return {
        paper_id: paper.id.toString(),
        status: paper.status,
        estimated_seconds: 0,
      };
    }
    if (paper.status !== PaperStatus.ready) {
      throw new BusinessException(
        ERROR_CODES.PARAM_INVALID,
        `仅 ready 状态可提交, 当前 ${paper.status}`,
      );
    }

    const answersMap = new Map(dto.answers.map((a) => [a.question_id, a] as const));

    // 遍历所有题:有答案→批, 没答案→记 0 分
    const upserts: Prisma.PrismaPromise<unknown>[] = [];
    let hasSubjective = false;

    for (const q of paper.questions) {
      const a = answersMap.get(q.id.toString());
      const userAnswer = a?.user_answer ?? null;

      if (q.type === QuestionType.short_answer) {
        hasSubjective = true;
        upserts.push(
          this.prisma.answer.upsert({
            where: {
              paperId_questionId_userId: { paperId, questionId: q.id, userId },
            },
            update: {
              userAnswer: userAnswer as Prisma.InputJsonValue,
              timeSpentSec: a?.time_spent_sec ?? null,
              isCorrect: null,
              score: null,
              gradedBy: null,
            },
            create: {
              paperId,
              questionId: q.id,
              userId,
              userAnswer: userAnswer as Prisma.InputJsonValue,
              timeSpentSec: a?.time_spent_sec ?? null,
              isCorrect: null,
              score: null,
              gradedBy: null,
            },
          }),
        );
      } else {
        const outcome = this.grader.grade(q, userAnswer);
        upserts.push(
          this.prisma.answer.upsert({
            where: {
              paperId_questionId_userId: { paperId, questionId: q.id, userId },
            },
            update: {
              userAnswer: outcome.user_answer_serialized as Prisma.InputJsonValue,
              isCorrect: outcome.is_correct ? 1 : 0,
              score: outcome.score,
              gradedBy: GradedBy.local,
              gradedAt: new Date(),
              timeSpentSec: a?.time_spent_sec ?? null,
            },
            create: {
              paperId,
              questionId: q.id,
              userId,
              userAnswer: outcome.user_answer_serialized as Prisma.InputJsonValue,
              isCorrect: outcome.is_correct ? 1 : 0,
              score: outcome.score,
              gradedBy: GradedBy.local,
              gradedAt: new Date(),
              timeSpentSec: a?.time_spent_sec ?? null,
            },
          }),
        );
      }
    }

    await this.prisma.$transaction([
      ...upserts,
      this.prisma.paper.update({
        where: { id: paper.id },
        data: {
          status: hasSubjective ? PaperStatus.submitted : PaperStatus.graded,
        },
      }),
    ]);

    if (hasSubjective) {
      await this.gradeQueue.add(
        'grade',
        { paper_id: paper.id.toString(), user_id: userId.toString() },
        { jobId: `paper-grade-${paper.id.toString()}`, priority: 1 },
      );
      return {
        paper_id: paper.id.toString(),
        status: PaperStatus.submitted,
        estimated_seconds: this.estimateGradeSeconds(paper.questions),
      };
    }

    // 所有题都是客观题, 批改已完成 → 触发错题入库 + mistakes
    // 注:错题入库走专门 service, 由 grade-worker 在主观题路径走完后做;
    // 这里我们直接异步触发(用 setImmediate 不阻塞 HTTP)
    setImmediate(() => {
      this.gradeQueue
        .add(
          'grade',
          { paper_id: paper.id.toString(), user_id: userId.toString() },
          { jobId: `paper-grade-${paper.id.toString()}`, priority: 1 },
        )
        .catch((err) => this.logger.warn(`grade queue 推送失败: ${(err as Error).message}`));
    });

    return {
      paper_id: paper.id.toString(),
      status: PaperStatus.graded,
      estimated_seconds: 0,
    };
  }

  // ============ 结果 ============

  /**
   * GET /v1/papers/{id}/result
   */
  async getResult(userId: bigint, paperId: bigint): Promise<PaperResultView> {
    const paper = await this.prisma.paper.findUnique({
      where: { id: paperId },
      include: {
        questions: { orderBy: { orderNo: 'asc' } },
      },
    });
    if (!paper || paper.userId !== userId) {
      throw new NotFoundBusinessException('试卷不存在');
    }
    if (paper.status === PaperStatus.generating || paper.status === PaperStatus.ready) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, `当前未提交, 状态 ${paper.status}`);
    }

    const answers = await this.prisma.answer.findMany({
      where: { paperId: paper.id, userId },
    });
    const answerMap = new Map(answers.map((a) => [a.questionId.toString(), a] as const));

    let totalScore = 0;
    let maxScore = 0;
    let timeSpent = 0;

    const items: PaperResultItem[] = paper.questions.map((q) => {
      const a = answerMap.get(q.id.toString());
      const fullScore = q.score;
      const score = a?.score ?? 0;
      maxScore += fullScore;
      totalScore += score;
      timeSpent += a?.timeSpentSec ?? 0;

      return {
        id: q.id.toString(),
        order_no: q.orderNo,
        type: q.type,
        difficulty: q.difficulty,
        stem: q.stem,
        options: q.options ?? null,
        full_score: fullScore,
        correct_answer: q.correctAnswer,
        explanation: q.explanation ?? null,
        knowledge_points: q.knowledgePoints ?? null,
        user_answer: a?.userAnswer ?? null,
        is_correct: a?.isCorrect === null || a?.isCorrect === undefined ? null : a.isCorrect === 1,
        score: a?.score ?? null,
        ai_feedback: a?.aiFeedback ?? null,
        ai_confidence:
          a?.aiConfidence === null || a?.aiConfidence === undefined ? null : Number(a.aiConfidence),
        graded_by: a?.gradedBy ?? null,
        time_spent_sec: a?.timeSpentSec ?? null,
      };
    });

    const accuracy = maxScore > 0 ? totalScore / maxScore : 0;

    return {
      paper_id: paper.id.toString(),
      status: paper.status,
      summary: {
        total_score: totalScore,
        max_score: maxScore,
        accuracy: Math.round(accuracy * 10000) / 10000,
        time_spent_sec: timeSpent || null,
      },
      questions: items,
    };
  }

  // ============ 给 worker 用的内部 API ============

  async findOwnedPaper(userId: bigint, paperId: bigint): Promise<Paper> {
    const paper = await this.prisma.paper.findUnique({ where: { id: paperId } });
    if (!paper || paper.userId !== userId) {
      throw new NotFoundBusinessException('试卷不存在');
    }
    return paper;
  }

  /** 由 idempotency key 算 hash(辅助前端) */
  static buildIdempotencyKey(userId: bigint, dto: CreatePaperDto): string {
    const parts = [
      userId.toString(),
      dto.source_type,
      dto.book_id ?? '',
      (dto.chapter_ids ?? []).join(','),
      dto.photo_set_id ?? '',
      dto.config.count.toString(),
      dto.config.difficulty,
      dto.config.question_types.slice().sort().join(','),
      dto.config.custom_prompt ?? '',
    ];
    return sha256(parts.join('|')).slice(0, 32);
  }

  // ============ 内部辅助 ============

  private async validateSource(
    userId: bigint,
    dto: CreatePaperDto,
  ): Promise<{
    bookId: bigint | null;
    chapterId: bigint | null;
    photoSetId: bigint | null;
    extraChapterIds: string[];
  }> {
    if (dto.source_type === 'book') {
      if (!dto.book_id) {
        throw new BusinessException(ERROR_CODES.PARAM_INVALID, 'book 模式必须传 book_id');
      }
      const book = await this.prisma.book.findUnique({ where: { id: BigInt(dto.book_id) } });
      if (!book || book.status !== 1) {
        throw new BusinessException(ERROR_CODES.RESOURCE_NOT_FOUND, '书籍不存在或已下架');
      }
      return { bookId: book.id, chapterId: null, photoSetId: null, extraChapterIds: [] };
    }

    if (dto.source_type === 'chapter') {
      if (!dto.chapter_ids || dto.chapter_ids.length === 0) {
        throw new BusinessException(ERROR_CODES.PARAM_INVALID, 'chapter 模式必须传 chapter_ids');
      }
      const chapters = await this.prisma.chapter.findMany({
        where: { id: { in: dto.chapter_ids.map((s) => BigInt(s)) } },
        include: { book: true },
      });
      if (chapters.length !== dto.chapter_ids.length) {
        throw new BusinessException(ERROR_CODES.RESOURCE_NOT_FOUND, '部分章节不存在');
      }
      const bookIds = new Set(chapters.map((c) => c.bookId.toString()));
      if (bookIds.size > 1) {
        throw new BusinessException(ERROR_CODES.PARAM_INVALID, '只能选择同一本书的章节');
      }
      const main = chapters[0];
      return {
        bookId: main.bookId,
        chapterId: main.id,
        photoSetId: null,
        extraChapterIds: chapters.slice(1).map((c) => c.id.toString()),
      };
    }

    // photo_set
    if (!dto.photo_set_id) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, 'photo_set 模式必须传 photo_set_id');
    }
    const set = await this.prisma.photoSet.findUnique({
      where: { id: BigInt(dto.photo_set_id) },
    });
    if (!set || set.userId !== userId) {
      throw new NotFoundBusinessException('拍照集不存在');
    }
    if (set.expiresAt.getTime() < Date.now()) {
      throw new BusinessException(ERROR_CODES.RESOURCE_NOT_FOUND, '拍照集已过期');
    }
    return { bookId: null, chapterId: null, photoSetId: set.id, extraChapterIds: [] };
  }

  private toEnumSource(s: CreatePaperDto['source_type']): PaperSourceType {
    switch (s) {
      case 'book':
        return PaperSourceType.book;
      case 'chapter':
        return PaperSourceType.chapter;
      case 'photo_set':
        return PaperSourceType.photo_set;
    }
  }

  private toQuestionView(q: Question, withAnswer: boolean): QuestionView {
    const v: QuestionView = {
      id: q.id.toString(),
      order_no: q.orderNo,
      type: q.type,
      difficulty: q.difficulty,
      stem: q.stem,
      options: q.options ?? null,
      score: q.score,
    };
    if (withAnswer) {
      v.correct_answer = q.correctAnswer;
      v.explanation = q.explanation ?? undefined;
      v.knowledge_points = q.knowledgePoints ?? null;
    }
    return v;
  }

  private toAnswerView(a: Answer): AnswerView {
    return {
      question_id: a.questionId.toString(),
      user_answer: a.userAnswer,
      is_correct: a.isCorrect === null ? null : a.isCorrect === 1,
      score: a.score ?? null,
      ai_feedback: a.aiFeedback ?? null,
      ai_confidence: a.aiConfidence === null ? null : Number(a.aiConfidence),
      graded_by: a.gradedBy ?? null,
      time_spent_sec: a.timeSpentSec ?? null,
    };
  }

  private estimateSeconds(count: number): number {
    // 经验值:DeepSeek 大约 1.5s/题, mock 立刻完成
    return Math.min(60, Math.max(8, Math.round(count * 1.5) + 5));
  }

  private estimateGradeSeconds(questions: Question[]): number {
    const subjectiveCount = questions.filter((q) => q.type === QuestionType.short_answer).length;
    if (subjectiveCount === 0) return 0;
    return Math.min(60, Math.max(8, subjectiveCount * 3 + 5));
  }

  private configCount(config: unknown): number {
    if (config && typeof config === 'object' && 'count' in (config as object)) {
      const v = (config as { count: unknown }).count;
      if (typeof v === 'number') return v;
    }
    return 10;
  }
}
