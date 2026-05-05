import { Injectable, Logger } from '@nestjs/common';
import { type Book, type Chapter, Prisma } from '@prisma/client';

import {
  BusinessException,
  NotFoundBusinessException,
} from '../../common/exceptions/business.exception';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { PrismaService } from '../../infra/prisma/prisma.service';

import type { ListBooksQuery } from './dto/list-books.query';

export interface BookListItem {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  description: string | null;
  category: string | null;
  tags: unknown;
  is_recommended: boolean;
  /** V2:用户是否收藏(MVP 始终 false)*/
  is_favorited: boolean;
}

export interface BookDetailView extends BookListItem {
  isbn: string | null;
  pdf_url: string | null;
  pdf_pages: number | null;
  copyright_status: string | null;
  source: string;
  created_at: string;
  chapters: ChapterBriefView[];
}

export interface ChapterBriefView {
  id: string;
  order_no: number;
  title: string;
  start_page: number | null;
  end_page: number | null;
  has_content: boolean;
}

export interface ChapterDetailView extends ChapterBriefView {
  book_id: string;
  content_summary: string | null;
}

/**
 * 用户侧书籍 / 章节业务
 * 文档:03-API §四 / 02-数据库 §3.2 / §3.3
 *
 * 普通用户只能看 status=1(已上架);软删除/未发布的不返回
 */
@Injectable()
export class BookService {
  private readonly logger = new Logger(BookService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ===== GET /v1/books =====

  async listForUser(query: ListBooksQuery): Promise<{
    list: BookListItem[];
    pagination: { page: number; page_size: number; total: number };
  }> {
    const where: Prisma.BookWhereInput = {
      status: 1,
      deletedAt: null,
    };
    if (query.keyword && query.keyword.trim().length > 0) {
      const kw = query.keyword.trim();
      where.OR = [
        { title: { contains: kw } },
        { author: { contains: kw } },
        { isbn: { contains: kw } },
      ];
    }
    if (query.category && query.category.trim().length > 0) {
      where.category = query.category.trim();
    }

    const orderBy = this.resolveOrder(query.sort);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.book.count({ where }),
      this.prisma.book.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
      }),
    ]);

    return {
      list: rows.map((b) => this.toListItem(b)),
      pagination: { page: query.page, page_size: query.page_size, total },
    };
  }

  // ===== GET /v1/books/:id =====

  async getDetail(bookId: bigint): Promise<BookDetailView> {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      include: {
        chapters: {
          orderBy: { orderNo: 'asc' },
        },
      },
    });
    if (!book || book.status !== 1 || book.deletedAt) {
      throw new NotFoundBusinessException('书籍不存在或未上架');
    }
    return this.toDetail(book, book.chapters);
  }

  // ===== GET /v1/chapters/:id =====

  async getChapterDetail(chapterId: bigint): Promise<ChapterDetailView> {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { book: true },
    });
    if (!chapter || chapter.book.status !== 1 || chapter.book.deletedAt) {
      throw new NotFoundBusinessException('章节不存在或未上架');
    }
    return {
      ...this.toChapterBrief(chapter),
      book_id: chapter.bookId.toString(),
      content_summary: chapter.contentSummary,
    };
  }

  // ===== 收藏:V2 占位(MVP 直接 stub 返回成功避免前端阻塞)=====

  async favorite(_userId: bigint, _bookId: bigint): Promise<{ ok: true; v2: true }> {
    throw new BusinessException(ERROR_CODES.PARAM_INVALID, '收藏功能将在 V2 启用');
  }

  // ===== 内部 =====

  private resolveOrder(sort: string): Prisma.BookOrderByWithRelationInput[] {
    switch (sort) {
      case 'latest':
        return [{ createdAt: 'desc' }];
      case 'hot':
        // MVP 没有真热度统计, 用「推荐 + 排序权重 + 创建时间」近似
        return [{ isRecommended: 'desc' }, { sortWeight: 'desc' }, { createdAt: 'desc' }];
      case 'recommended':
      default:
        return [{ isRecommended: 'desc' }, { sortWeight: 'desc' }, { createdAt: 'desc' }];
    }
  }

  private toListItem(b: Book): BookListItem {
    return {
      id: b.id.toString(),
      title: b.title,
      author: b.author,
      cover_url: b.coverUrl,
      description: b.description,
      category: b.category,
      tags: b.tags ?? null,
      is_recommended: b.isRecommended === 1,
      is_favorited: false,
    };
  }

  private toDetail(b: Book, chapters: Chapter[]): BookDetailView {
    return {
      ...this.toListItem(b),
      isbn: b.isbn,
      pdf_url: b.pdfUrl,
      pdf_pages: b.pdfPages,
      copyright_status: b.copyrightStatus,
      source: b.source,
      created_at: b.createdAt.toISOString(),
      chapters: chapters.map((c) => this.toChapterBrief(c)),
    };
  }

  private toChapterBrief(c: Chapter): ChapterBriefView {
    return {
      id: c.id.toString(),
      order_no: c.orderNo,
      title: c.title,
      start_page: c.startPage,
      end_page: c.endPage,
      has_content: !!(c.contentFull && c.contentFull.length > 0),
    };
  }
}
