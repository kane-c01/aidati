import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  BookSource,
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
import { MistakeService } from '../mistake/mistake.service';
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

export interface PaperHistoryItem extends PaperBriefView {
  /** 试卷归属书 / 章节标题 / 拍照集名(展示用) */
  book_id: string | null;
  book_title: string | null;
  chapter_id: string | null;
  chapter_title: string | null;
  photo_set_id: string | null;
  photo_set_name: string | null;

  /** 客观批改后才有, 否则 null */
  total_score: number | null;
  max_score: number | null;
  accuracy: number | null;
  time_spent_sec: number | null;
  answered_count: number;
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
    private readonly mistakes: MistakeService,
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
        // photo_set 模式:用户在校对页勾选的子集(M9)
        // 缺省 / 空 / 等于全部 photo: 不写入, 让 context-builder 走原逻辑(用 set.ocrText)
        ...(dto.source_type === 'photo_set' &&
        Array.isArray(dto.selected_photo_ids) &&
        dto.selected_photo_ids.length > 0
          ? { selected_photo_ids: dto.selected_photo_ids }
          : {}),
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

  // ============ 列表(历史试卷) ============

  /**
   * GET /v1/papers
   *
   * 返回用户自己的试卷, 默认按创建时间倒序; 仅返回 status 在 ready/submitted/graded 的, 失败/生成中不展示。
   * 一次性聚合 answer / question 统计, 单次 4 条 SQL 即可。
   */
  async listUserPapers(
    userId: bigint,
    opts: {
      status?: 'all' | 'ready' | 'submitted' | 'graded';
      bookId?: bigint | null;
      chapterId?: bigint | null;
      page: number;
      pageSize: number;
    },
  ): Promise<{
    list: PaperHistoryItem[];
    pagination: { page: number; page_size: number; total: number };
  }> {
    const where: Prisma.PaperWhereInput = { userId };
    if (opts.bookId) {
      where.bookId = opts.bookId;
    }
    if (opts.chapterId) {
      where.chapterId = opts.chapterId;
    }
    if (opts.status && opts.status !== 'all') {
      where.status = opts.status as PaperStatus;
    } else {
      // 默认只展示有意义的(排除 generating / failed)
      where.status = {
        in: [PaperStatus.ready, PaperStatus.submitted, PaperStatus.graded],
      };
    }

    const [total, papers] = await this.prisma.$transaction([
      this.prisma.paper.count({ where }),
      this.prisma.paper.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        include: {
          book: { select: { id: true, title: true } },
          chapter: { select: { id: true, title: true } },
          photoSet: { select: { id: true, name: true } },
        },
      }),
    ]);

    if (papers.length === 0) {
      return {
        list: [],
        pagination: { page: opts.page, page_size: opts.pageSize, total },
      };
    }

    const paperIds = papers.map((p) => p.id);

    const [answerAgg, questionAgg] = await this.prisma.$transaction([
      this.prisma.answer.groupBy({
        by: ['paperId'],
        where: { userId, paperId: { in: paperIds } },
        _sum: { score: true, timeSpentSec: true },
        _count: true,
        orderBy: { paperId: 'asc' },
      }),
      this.prisma.question.groupBy({
        by: ['paperId'],
        where: { paperId: { in: paperIds } },
        _sum: { score: true },
        orderBy: { paperId: 'asc' },
      }),
    ]);

    const ansMap = new Map(answerAgg.map((a) => [a.paperId.toString(), a]));
    const qMap = new Map(questionAgg.map((q) => [q.paperId.toString(), q]));

    const list: PaperHistoryItem[] = papers.map((p) => {
      const pid = p.id.toString();
      const ans = ansMap.get(pid);
      const q = qMap.get(pid);

      const isGraded = p.status === PaperStatus.graded;
      const totalScore = ans?._sum?.score ?? null;
      const maxScore = q?._sum?.score ?? null;
      const accuracy =
        isGraded && totalScore !== null && maxScore && maxScore > 0
          ? Math.round((totalScore / maxScore) * 10000) / 10000
          : null;

      return {
        id: pid,
        status: p.status,
        source_type: p.sourceType,
        total_questions: p.totalQuestions,
        created_at: p.createdAt.toISOString(),
        book_id: p.bookId?.toString() ?? null,
        book_title: p.book?.title ?? null,
        chapter_id: p.chapterId?.toString() ?? null,
        chapter_title: p.chapter?.title ?? null,
        photo_set_id: p.photoSetId?.toString() ?? null,
        photo_set_name: p.photoSet?.name ?? null,
        total_score: isGraded ? totalScore : null,
        max_score: isGraded ? maxScore : null,
        accuracy,
        time_spent_sec: ans?._sum?.timeSpentSec ?? null,
        answered_count: typeof ans?._count === 'number' ? ans._count : 0,
      };
    });

    return {
      list,
      pagination: { page: opts.page, page_size: opts.pageSize, total },
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

    // 用 updateMany + where 限定 generating, 防止与 worker 并发时把 ready 误改回 failed
    // 时序: cancel 读到 generating → worker 在 select/update 之间已写 ready → cancel 再 update 会把 ready 翻成 failed
    const updated = await this.prisma.paper.updateMany({
      where: { id: paper.id, status: PaperStatus.generating },
      data: { status: PaperStatus.failed },
    });
    if (updated.count === 0) {
      // worker 抢先写完 ready → 取消已经无意义, 当作"刚好出题完成"返回, 让前端跳答题页
      const fresh = await this.prisma.paper.findUnique({ where: { id: paper.id } });
      throw new BusinessException(
        ERROR_CODES.PARAM_INVALID,
        `仅在 generating 状态可取消, 当前 ${fresh?.status ?? 'unknown'}`,
      );
    }

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

    // 纯客观题:已在事务里完成所有打分, 此处同步把错题入库到 mistake 本
    // 注:不再 enqueue grade-worker, 因为它的早退判断会让 status=graded 跳过错题循环
    // (历史 BUG: setImmediate + worker 早退 → 客观题错题永远不入库)
    try {
      const refreshed = await this.prisma.answer.findMany({
        where: { paperId: paper.id, userId },
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
          await this.mistakes.recordCorrect({ userId, question: q });
        }
      }
      this.logger.log(
        `submit.objective_done paper=${paper.id} mistakes_added=${mistakeCount}`,
      );
    } catch (err) {
      // 错题入库失败不阻塞结果返回, 只记日志便于排查
      this.logger.error(
        `submit.mistake_sync_failed paper=${paper.id} err=${(err as Error).message}`,
      );
    }

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
      if (!book || book.status !== 1 || book.deletedAt) {
        throw new BusinessException(ERROR_CODES.RESOURCE_NOT_FOUND, '书籍不存在或已下架');
      }
      // user_upload 隐私校验:非 owner + 未推荐 → 视为不存在(与 BookService.getDetail 一致)
      this.assertBookVisible(book, userId);
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
      // 章节所属书籍可见性校验(对齐 BookService.getChapterFull)
      if (main.book.status !== 1 || main.book.deletedAt) {
        throw new BusinessException(ERROR_CODES.RESOURCE_NOT_FOUND, '章节所属书籍不存在或已下架');
      }
      this.assertBookVisible(main.book, userId);
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

  /**
   * 与 BookService.getDetail / getChapterFull 一致的可见性规则:
   * user_upload 且未推荐时, 仅 owner 可见; 否则一律视为不存在
   */
  private assertBookVisible(
    book: { source: BookSource; isRecommended: number; createdBy: bigint | null },
    userId: bigint,
  ): void {
    if (book.source === BookSource.user_upload && book.isRecommended !== 1) {
      if (book.createdBy !== userId) {
        throw new NotFoundBusinessException('书籍不存在或已下架');
      }
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
