import { Injectable, Logger } from '@nestjs/common';
import { MistakeStatus, type Question, type Mistake } from '@prisma/client';

import { sha256 } from '../../common/utils/sha256';
import { PrismaService } from '../../infra/prisma/prisma.service';

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
}

// 暴露 sha256 便于在不重新引入工具时构建 stem hash 变体(暂未使用)
export const _sha = sha256;
