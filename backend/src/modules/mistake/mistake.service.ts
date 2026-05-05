import { Injectable, Logger } from '@nestjs/common';
import {
  MistakeStatus,
  PaperSourceType,
  PaperStatus,
  type Mistake,
  type Prisma,
  type Question,
} from '@prisma/client';

import { ERROR_CODES } from '../../common/constants/error-codes';
import {
  BusinessException,
  NotFoundBusinessException,
} from '../../common/exceptions/business.exception';
import { sha256 } from '../../common/utils/sha256';
import { PrismaService } from '../../infra/prisma/prisma.service';

import type { ListMistakesQuery } from './dto/list-mistakes.query';
import { STATUS_FILTER_MAP } from './dto/list-mistakes.query';
import type { PracticeMistakesDto } from './dto/practice-mistakes.dto';

import { buildStemHash } from '../paper/services/answer-grader.service';

/** 连续答对几次自动 mastered, 与 PRD §3.5 一致 */
const AUTO_MASTER_THRESHOLD = 2;

export interface MistakeView {
  id: string;
  question_id: string;
  book_id: string | null;
  stem_hash: string;
  wrong_count: number;
  consecutive_correct: number;
  status: MistakeStatus;
  first_wrong_at: string;
  last_wrong_at: string;
  mastered_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 错题本服务
 * 文档:02-数据库 §3.9 / 03-API §八 / PRD §3.5
 *
 * MVP 仅暴露:
 * - recordWrong  批改时自动创建/累加错题(M3 联动)
 * - recordCorrect 重做错题答对时更新 consecutive_correct(M4 联动)
 *
 * 列表 / 标记掌握等 HTTP 接口在 M4 模块完工时再加 controller
 */
@Injectable()
export class MistakeService {
  private readonly logger = new Logger(MistakeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 用户答错 → 错题本累计
   *
   * 去重键:(user_id, stem_hash)
   * - 第一次错:create + first/last_wrong_at = now, wrong_count=1
   * - 再次错:wrong_count++, last_wrong_at = now, consecutive_correct = 0
   *   若之前已 mastered, 自动重置回 active(用户没真正掌握)
   */
  async recordWrong(args: {
    userId: bigint;
    question: Question;
    bookId?: bigint | null;
  }): Promise<Mistake> {
    const stemHash = buildStemHash(args.question.stem, args.question.type);
    const now = new Date();

    return this.prisma.mistake.upsert({
      where: { userId_stemHash: { userId: args.userId, stemHash } },
      create: {
        userId: args.userId,
        questionId: args.question.id,
        bookId: args.bookId ?? null,
        stemHash,
        firstWrongAt: now,
        lastWrongAt: now,
        wrongCount: 1,
        consecutiveCorrect: 0,
        status: MistakeStatus.active,
      },
      update: {
        wrongCount: { increment: 1 },
        lastWrongAt: now,
        consecutiveCorrect: 0,
        status: MistakeStatus.active,
        masteredAt: null,
        // 题目 id 漂移(同 stem 但是新 question)时, 把指针更新到最新的
        questionId: args.question.id,
        bookId: args.bookId ?? undefined,
      },
    });
  }

  /**
   * 用户重做错题答对 → consecutive_correct +1, 达阈值自动 mastered
   * 同 stem 关系基于 stem_hash 找
   */
  async recordCorrect(args: { userId: bigint; question: Question }): Promise<Mistake | null> {
    const stemHash = buildStemHash(args.question.stem, args.question.type);
    const existing = await this.prisma.mistake.findUnique({
      where: { userId_stemHash: { userId: args.userId, stemHash } },
    });
    if (!existing || existing.status === MistakeStatus.mastered) {
      // 不存在 / 已自动 mastered, 不必再动
      return null;
    }

    const consecutive = existing.consecutiveCorrect + 1;
    const shouldMaster =
      existing.status === MistakeStatus.active && consecutive >= AUTO_MASTER_THRESHOLD;

    return this.prisma.mistake.update({
      where: { id: existing.id },
      data: {
        consecutiveCorrect: consecutive,
        status: shouldMaster ? MistakeStatus.mastered : existing.status,
        masteredAt: shouldMaster ? new Date() : existing.masteredAt,
      },
    });
  }

  // ============ HTTP 接口走的业务方法 ============

  /**
   * GET /v1/mistakes — 错题列表
   * 文档:03-API §8.1
   */
  async listForUser(
    userId: bigint,
    query: ListMistakesQuery,
  ): Promise<{
    list: Array<MistakeView & { question: QuestionBriefView }>;
    pagination: { page: number; page_size: number; total: number };
    summary: { active: number; mastered: number };
  }> {
    const { page = 1, page_size = 20, status = 'active' } = query;
    const where: Prisma.MistakeWhereInput = { userId };
    const statuses = STATUS_FILTER_MAP[status];
    if (statuses) where.status = { in: statuses };
    if (query.book_id) where.bookId = BigInt(query.book_id);

    const [total, rows, activeCnt, masteredCnt] = await this.prisma.$transaction([
      this.prisma.mistake.count({ where }),
      this.prisma.mistake.findMany({
        where,
        orderBy: [{ lastWrongAt: 'desc' }],
        skip: (page - 1) * page_size,
        take: page_size,
        include: { question: true },
      }),
      this.prisma.mistake.count({ where: { userId, status: MistakeStatus.active } }),
      this.prisma.mistake.count({
        where: {
          userId,
          status: { in: [MistakeStatus.mastered, MistakeStatus.manual_mastered] },
        },
      }),
    ]);

    return {
      list: rows.map((m) => ({
        ...this.toView(m),
        question: this.toQuestionBrief(m.question),
      })),
      pagination: { page, page_size, total },
      summary: { active: activeCnt, mastered: masteredCnt },
    };
  }

  /**
   * POST /v1/mistakes/{id}/master — 用户手动标记掌握
   * 文档:03-API §8.2
   */
  async markMastered(userId: bigint, mistakeId: bigint): Promise<MistakeView> {
    const m = await this.findOwned(userId, mistakeId);
    if (m.status === MistakeStatus.manual_mastered) return this.toView(m);
    const updated = await this.prisma.mistake.update({
      where: { id: m.id },
      data: {
        status: MistakeStatus.manual_mastered,
        masteredAt: new Date(),
      },
    });
    return this.toView(updated);
  }

  /**
   * POST /v1/mistakes/{id}/unmaster — 取消掌握, 重新进入 active
   */
  async unmarkMastered(userId: bigint, mistakeId: bigint): Promise<MistakeView> {
    const m = await this.findOwned(userId, mistakeId);
    if (m.status === MistakeStatus.active) return this.toView(m);
    const updated = await this.prisma.mistake.update({
      where: { id: m.id },
      data: {
        status: MistakeStatus.active,
        masteredAt: null,
        consecutiveCorrect: 0,
      },
    });
    return this.toView(updated);
  }

  /**
   * DELETE /v1/mistakes/{id}
   */
  async deleteOne(userId: bigint, mistakeId: bigint): Promise<{ ok: true }> {
    const m = await this.findOwned(userId, mistakeId);
    await this.prisma.mistake.delete({ where: { id: m.id } });
    return { ok: true };
  }

  /**
   * POST /v1/mistakes/practice — 错题重做, 不走 LLM, 复用原题
   * 文档:03-API §8.3
   *
   * 实现:把选中错题对应的 Question 克隆到新 Paper(同一 stem 不同 paperId);
   * 新 paper.config.is_practice=true 标识不计配额、不需要内容审核。
   * 答题完成后批改时, MistakeService.recordCorrect 会按 stem_hash 找原 mistake 更新 consecutive_correct
   */
  async createPracticePaper(
    userId: bigint,
    dto: PracticeMistakesDto,
  ): Promise<{ paper_id: string; total_questions: number }> {
    if (!dto.mistake_ids?.length && !dto.include_book_id) {
      throw new BusinessException(
        ERROR_CODES.PARAM_INVALID,
        'mistake_ids 与 include_book_id 必须二选一',
      );
    }

    // 1) 取错题
    const where: Prisma.MistakeWhereInput = { userId, status: MistakeStatus.active };
    if (dto.mistake_ids?.length) {
      where.id = { in: dto.mistake_ids.map((s) => BigInt(s)) };
    } else if (dto.include_book_id) {
      where.bookId = BigInt(dto.include_book_id);
    }
    const mistakes = await this.prisma.mistake.findMany({
      where,
      include: { question: true },
      orderBy: { lastWrongAt: 'desc' },
      take: dto.limit ?? 50,
    });
    if (mistakes.length === 0) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, '没有可重做的活跃错题');
    }

    // 2) 决定 sourceType / bookId(尝试用第一道题的)
    const firstBookId = mistakes.find((m) => m.bookId)?.bookId ?? null;

    // 3) 克隆 paper + question
    const paper = await this.prisma.$transaction(async (tx) => {
      const created = await tx.paper.create({
        data: {
          userId,
          sourceType: firstBookId ? PaperSourceType.book : PaperSourceType.book,
          bookId: firstBookId,
          chapterId: null,
          photoSetId: null,
          status: PaperStatus.ready,
          totalQuestions: mistakes.length,
          config: {
            is_practice: true,
            mistake_ids: mistakes.map((m) => m.id.toString()),
            count: mistakes.length,
            difficulty: 'medium',
            question_types: Array.from(new Set(mistakes.map((m) => m.question.type))),
          } as Prisma.InputJsonValue,
        },
      });

      // 题目克隆:order_no 按错题选择顺序重新排
      let order = 1;
      for (const m of mistakes) {
        const q = m.question;
        await tx.question.create({
          data: {
            paperId: created.id,
            orderNo: order++,
            type: q.type,
            difficulty: q.difficulty,
            stem: q.stem,
            options: (q.options ?? null) as unknown as Prisma.InputJsonValue,
            correctAnswer: q.correctAnswer as unknown as Prisma.InputJsonValue,
            explanation: q.explanation,
            knowledgePoints: (q.knowledgePoints ?? []) as unknown as Prisma.InputJsonValue,
            stemHash: q.stemHash,
            score: q.score,
          },
        });
      }
      return created;
    });

    return {
      paper_id: paper.id.toString(),
      total_questions: mistakes.length,
    };
  }

  // ============ 内部 ============

  private async findOwned(userId: bigint, mistakeId: bigint): Promise<Mistake> {
    const m = await this.prisma.mistake.findUnique({ where: { id: mistakeId } });
    if (!m || m.userId !== userId) {
      throw new NotFoundBusinessException('错题不存在');
    }
    return m;
  }

  /** Mistake → API 视图(BigInt → string + 时间 ISO) */
  toView(m: Mistake): MistakeView {
    return {
      id: m.id.toString(),
      question_id: m.questionId.toString(),
      book_id: m.bookId ? m.bookId.toString() : null,
      stem_hash: m.stemHash,
      wrong_count: m.wrongCount,
      consecutive_correct: m.consecutiveCorrect,
      status: m.status,
      first_wrong_at: m.firstWrongAt.toISOString(),
      last_wrong_at: m.lastWrongAt.toISOString(),
      mastered_at: m.masteredAt ? m.masteredAt.toISOString() : null,
      created_at: m.createdAt.toISOString(),
      updated_at: m.updatedAt.toISOString(),
    };
  }

  toQuestionBrief(q: Question): QuestionBriefView {
    return {
      id: q.id.toString(),
      stem: q.stem,
      type: q.type,
      difficulty: q.difficulty,
      options: q.options ?? null,
      score: q.score,
      knowledge_points: q.knowledgePoints ?? null,
    };
  }
}

export interface QuestionBriefView {
  id: string;
  stem: string;
  type: string;
  difficulty: string;
  options: unknown;
  score: number;
  knowledge_points: unknown;
}

// 暴露 sha256 便于在不重新引入工具时构建 stem hash 变体(暂未使用)
export const _sha = sha256;
