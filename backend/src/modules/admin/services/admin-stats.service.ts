import { Injectable } from '@nestjs/common';
import { ModerationResult, PaperStatus } from '@prisma/client';

import { nextShanghaiMidnightUtc, todayInShanghaiAsDate } from '../../../common/utils/timezone';
import { PrismaService } from '../../../infra/prisma/prisma.service';

export interface AdminDashboardData {
  today: {
    date: string;
    dau: number;
    new_users: number;
    papers_created: number;
    papers_graded: number;
    /** AI 成本(元) */
    ai_cost: number;
  };
  pending: {
    /** 内容审核 block 总数(7d), 24h 比例 */
    moderation_block_7d: number;
    moderation_block_24h: number;
    /** 注:V2 才有, MVP 先放 0 */
    book_uploads_pending: number;
    reports_pending: number;
    appeals_pending: number;
  };
  totals: {
    users: number;
    books_published: number;
    papers_total: number;
    mistakes_active: number;
  };
  reset_at: string;
}

/**
 * 管理员工作台数据
 * 文档:03-API §12.1
 */
@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(): Promise<AdminDashboardData> {
    const today = todayInShanghaiAsDate();
    const tomorrow = nextShanghaiMidnightUtc();
    const dayStart = today;
    const day7Start = new Date(today.getTime() - 6 * 86400_000);
    const dayMinus1Start = new Date(today.getTime() - 86400_000);

    const [
      dauRows,
      newUsers,
      papersCreated,
      papersGraded,
      papers,
      moderation7d,
      moderation24h,
      totalUsers,
      booksPublished,
      papersTotal,
      mistakesActive,
    ] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: { lastLoginAt: { gte: dayStart, lt: tomorrow } },
        select: { id: true },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: dayStart, lt: tomorrow } },
      }),
      this.prisma.paper.count({
        where: { createdAt: { gte: dayStart, lt: tomorrow } },
      }),
      this.prisma.paper.count({
        where: {
          updatedAt: { gte: dayStart, lt: tomorrow },
          status: PaperStatus.graded,
        },
      }),
      this.prisma.paper.findMany({
        where: { createdAt: { gte: dayStart, lt: tomorrow } },
        select: { llmCost: true },
      }),
      this.prisma.moderationLog.count({
        where: {
          createdAt: { gte: day7Start, lt: tomorrow },
          result: ModerationResult.block,
        },
      }),
      this.prisma.moderationLog.count({
        where: {
          createdAt: { gte: dayMinus1Start, lt: tomorrow },
          result: ModerationResult.block,
        },
      }),
      this.prisma.user.count({ where: { status: 1 } }),
      this.prisma.book.count({ where: { status: 1, deletedAt: null } }),
      this.prisma.paper.count(),
      this.prisma.mistake.count({ where: { status: 'active' } }),
    ]);

    const aiCost = papers.reduce((sum, p) => {
      if (!p.llmCost) return sum;
      const n = Number(p.llmCost);
      return Number.isFinite(n) ? sum + n : sum;
    }, 0);

    return {
      today: {
        date: today.toISOString().slice(0, 10),
        dau: dauRows.length,
        new_users: newUsers,
        papers_created: papersCreated,
        papers_graded: papersGraded,
        ai_cost: Math.round(aiCost * 10000) / 10000,
      },
      pending: {
        moderation_block_7d: moderation7d,
        moderation_block_24h: moderation24h,
        book_uploads_pending: 0,
        reports_pending: 0,
        appeals_pending: 0,
      },
      totals: {
        users: totalUsers,
        books_published: booksPublished,
        papers_total: papersTotal,
        mistakes_active: mistakesActive,
      },
      reset_at: tomorrow.toISOString(),
    };
  }
}
