import { Injectable } from '@nestjs/common';
import { type Prisma, ModerationResult, type ModerationScene } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma/prisma.service';

import type { ListAuditsQuery } from '../dto/admin-config.dto';

export interface ModerationLogView {
  id: string;
  user_id: string | null;
  scene: ModerationScene;
  result: ModerationResult;
  reason: string | null;
  api_provider: string;
  content_hash: string;
  content_snapshot_url: string | null;
  created_at: string;
}

@Injectable()
export class AdminModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAuditsQuery): Promise<{
    list: ModerationLogView[];
    pagination: { page: number; page_size: number; total: number };
  }> {
    const where: Prisma.ModerationLogWhereInput = {};
    if (query.scene) where.scene = query.scene as ModerationScene;
    if (
      query.result &&
      Object.values(ModerationResult).includes(query.result as ModerationResult)
    ) {
      where.result = query.result as ModerationResult;
    }
    if (query.user_id) where.userId = BigInt(query.user_id);
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.moderationLog.count({ where }),
      this.prisma.moderationLog.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
      }),
    ]);

    return {
      list: rows.map((r) => ({
        id: r.id.toString(),
        user_id: r.userId ? r.userId.toString() : null,
        scene: r.scene,
        result: r.result,
        reason: r.reason,
        api_provider: r.apiProvider,
        content_hash: r.contentHash,
        content_snapshot_url: r.contentSnapshotUrl,
        created_at: r.createdAt.toISOString(),
      })),
      pagination: { page: query.page, page_size: query.page_size, total },
    };
  }
}
