import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { NotFoundBusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../infra/prisma/prisma.service';

import type { ListFavoritesQuery } from './dto/list-favorites.query';

export interface FavoriteListItem {
  id: string;
  book_id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  description: string | null;
  tags: unknown;
  is_recommended: boolean;
  is_favorited: true;
  created_at: string;
}

/**
 * 收藏业务
 *
 * 行为约定:
 *  - 创建幂等(uk_favorite_user_book): 已收藏再 POST 直接返回当前记录
 *  - 删除幂等: 不存在/已删除 直接返回 ok=true
 *  - 列表只返回 status=1 + deletedAt=null 的书; 已下架/软删的书不展示但保留收藏行(便于上架后恢复)
 */
@Injectable()
export class FavoriteService {
  private readonly logger = new Logger(FavoriteService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ===== POST /v1/favorites =====
  async add(userId: bigint, bookId: bigint): Promise<{ id: string; favorited: true }> {
    const book = await this.prisma.book.findUnique({ where: { id: bookId } });
    if (!book || book.status !== 1 || book.deletedAt) {
      throw new NotFoundBusinessException('书籍不存在或已下架');
    }

    try {
      const fav = await this.prisma.favorite.upsert({
        where: { userId_bookId: { userId, bookId } },
        update: {},
        create: { userId, bookId },
      });
      this.logger.log(`favorite.add user=${userId} book=${bookId}`);
      return { id: fav.id.toString(), favorited: true };
    } catch (err) {
      // upsert 不应抛 P2002, 但保险起见
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.favorite.findUnique({
          where: { userId_bookId: { userId, bookId } },
        });
        if (existing) {
          return { id: existing.id.toString(), favorited: true };
        }
      }
      throw err;
    }
  }

  // ===== DELETE /v1/favorites/:bookId =====
  async remove(userId: bigint, bookId: bigint): Promise<{ ok: true }> {
    const fav = await this.prisma.favorite.findUnique({
      where: { userId_bookId: { userId, bookId } },
    });
    if (!fav) {
      // 幂等: 不存在视为已取消
      return { ok: true };
    }
    await this.prisma.favorite.delete({ where: { id: fav.id } });
    this.logger.log(`favorite.remove user=${userId} book=${bookId}`);
    return { ok: true };
  }

  // ===== GET /v1/favorites =====
  async list(
    userId: bigint,
    query: ListFavoritesQuery,
  ): Promise<{
    list: FavoriteListItem[];
    pagination: { page: number; page_size: number; total: number };
  }> {
    const where: Prisma.FavoriteWhereInput = {
      userId,
      // 只展示在架书 (V2 可改为始终展示, 让用户自己删除已下架收藏)
      book: { status: 1, deletedAt: null },
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.favorite.count({ where }),
      this.prisma.favorite.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
        include: { book: true },
      }),
    ]);

    return {
      list: rows.map((f) => ({
        id: f.id.toString(),
        book_id: f.bookId.toString(),
        title: f.book.title,
        author: f.book.author,
        cover_url: f.book.coverUrl,
        description: f.book.description,
        tags: f.book.tags ?? null,
        is_recommended: f.book.isRecommended === 1,
        is_favorited: true,
        created_at: f.createdAt.toISOString(),
      })),
      pagination: { page: query.page, page_size: query.page_size, total },
    };
  }

  // ===== Internal: 给 BookService 用的批量查询 =====

  /**
   * 给定一组 book_id, 返回当前用户收藏过的 book_id 集合(string)。
   *
   * 用于 GET /v1/books 列表 / 详情批量染色 is_favorited
   */
  async findFavoritedBookIds(userId: bigint, bookIds: bigint[]): Promise<Set<string>> {
    if (bookIds.length === 0) return new Set();
    const rows = await this.prisma.favorite.findMany({
      where: { userId, bookId: { in: bookIds } },
      select: { bookId: true },
    });
    return new Set(rows.map((r) => r.bookId.toString()));
  }
}
