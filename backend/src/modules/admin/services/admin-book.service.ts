import { Injectable, Logger } from '@nestjs/common';
import { type Book, type Chapter, BookSource, type Prisma } from '@prisma/client';

import {
  BusinessException,
  NotFoundBusinessException,
} from '../../../common/exceptions/business.exception';
import { ERROR_CODES } from '../../../common/constants/error-codes';
import { PrismaService } from '../../../infra/prisma/prisma.service';

import type {
  CreateBookDto,
  ImportChaptersDto,
  ListAdminBooksQuery,
  UpdateBookDto,
} from '../dto/admin-book.dto';

import { AdminLogService } from './admin-log.service';

export interface AdminBookView {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  description: string | null;
  cover_url: string | null;
  pdf_url: string | null;
  pdf_pages: number | null;
  category: string | null;
  tags: unknown;
  source: BookSource;
  copyright_status: string | null;
  status: number;
  is_recommended: boolean;
  sort_weight: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  chapters_count: number;
}

@Injectable()
export class AdminBookService {
  private readonly logger = new Logger(AdminBookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminLog: AdminLogService,
  ) {}

  // ===== 列表 / 详情 =====

  async list(query: ListAdminBooksQuery): Promise<{
    list: AdminBookView[];
    pagination: { page: number; page_size: number; total: number };
  }> {
    const where: Prisma.BookWhereInput = {};
    if (query.status === undefined || query.status === 'all') {
      // 默认含已下架, 不含已删除
      where.deletedAt = null;
    } else {
      where.status = parseInt(query.status, 10);
    }
    if (query.created_by) where.createdBy = BigInt(query.created_by);
    if (query.keyword && query.keyword.trim().length > 0) {
      const kw = query.keyword.trim();
      where.OR = [
        { title: { contains: kw } },
        { author: { contains: kw } },
        { isbn: { contains: kw } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.book.count({ where }),
      this.prisma.book.findMany({
        where,
        orderBy: [{ sortWeight: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
        include: { _count: { select: { chapters: true } } },
      }),
    ]);

    return {
      list: rows.map((b) => this.toView(b, b._count.chapters)),
      pagination: { page: query.page, page_size: query.page_size, total },
    };
  }

  async detail(bookId: bigint): Promise<AdminBookView & { chapters: ChapterAdminView[] }> {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      include: {
        chapters: { orderBy: { orderNo: 'asc' } },
      },
    });
    if (!book) throw new NotFoundBusinessException('书籍不存在');
    return {
      ...this.toView(book, book.chapters.length),
      chapters: book.chapters.map((c) => this.toChapterView(c)),
    };
  }

  // ===== 创建 / 编辑 / 删除 =====

  async create(adminId: bigint, dto: CreateBookDto): Promise<AdminBookView> {
    const book = await this.prisma.book.create({
      data: {
        title: dto.title,
        author: dto.author ?? null,
        isbn: dto.isbn ?? null,
        description: dto.description ?? null,
        coverUrl: dto.cover_url ?? null,
        pdfUrl: dto.pdf_url ?? null,
        pdfPages: dto.pdf_pages ?? null,
        category: dto.category ?? null,
        tags: (dto.tags ?? []) as Prisma.InputJsonValue,
        source: BookSource.admin,
        copyrightStatus: dto.copyright_status ?? null,
        status: 1,
        isRecommended: 0,
        sortWeight: 0,
        createdBy: adminId,
      },
    });
    await this.adminLog.record({
      adminId,
      action: 'book.create',
      targetType: 'book',
      targetId: book.id,
      meta: { title: book.title },
    });
    return this.toView(book, 0);
  }

  async update(adminId: bigint, bookId: bigint, dto: UpdateBookDto): Promise<AdminBookView> {
    await this.findOrThrow(bookId);
    const updated = await this.prisma.book.update({
      where: { id: bookId },
      data: {
        title: dto.title,
        author: dto.author,
        isbn: dto.isbn,
        description: dto.description,
        coverUrl: dto.cover_url,
        pdfUrl: dto.pdf_url,
        pdfPages: dto.pdf_pages,
        category: dto.category,
        tags: dto.tags ? (dto.tags as Prisma.InputJsonValue) : undefined,
        copyrightStatus: dto.copyright_status,
        sortWeight: dto.sort_weight,
      },
    });
    await this.adminLog.record({
      adminId,
      action: 'book.update',
      targetType: 'book',
      targetId: bookId,
      meta: dto as unknown as Prisma.InputJsonValue,
    });
    const cnt = await this.prisma.chapter.count({ where: { bookId } });
    return this.toView(updated, cnt);
  }

  async softDelete(adminId: bigint, bookId: bigint): Promise<{ ok: true }> {
    await this.findOrThrow(bookId);
    await this.prisma.book.update({
      where: { id: bookId },
      data: { status: -1, deletedAt: new Date() },
    });
    await this.adminLog.record({
      adminId,
      action: 'book.delete',
      targetType: 'book',
      targetId: bookId,
    });
    return { ok: true };
  }

  async setRecommend(adminId: bigint, bookId: bigint, recommend: boolean): Promise<AdminBookView> {
    await this.findOrThrow(bookId);
    const updated = await this.prisma.book.update({
      where: { id: bookId },
      data: { isRecommended: recommend ? 1 : 0 },
    });
    await this.adminLog.record({
      adminId,
      action: recommend ? 'book.recommend' : 'book.unrecommend',
      targetType: 'book',
      targetId: bookId,
    });
    const cnt = await this.prisma.chapter.count({ where: { bookId } });
    return this.toView(updated, cnt);
  }

  async setStatus(adminId: bigint, bookId: bigint, status: 1 | 0): Promise<AdminBookView> {
    await this.findOrThrow(bookId);
    const updated = await this.prisma.book.update({
      where: { id: bookId },
      data: { status },
    });
    await this.adminLog.record({
      adminId,
      action: status === 1 ? 'book.online' : 'book.offline',
      targetType: 'book',
      targetId: bookId,
    });
    const cnt = await this.prisma.chapter.count({ where: { bookId } });
    return this.toView(updated, cnt);
  }

  // ===== 章节 =====

  async importChapters(
    adminId: bigint,
    bookId: bigint,
    dto: ImportChaptersDto,
  ): Promise<{ imported: number; total: number }> {
    await this.findOrThrow(bookId);
    if (dto.chapters.length === 0) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, '至少传 1 章');
    }
    const orderNos = dto.chapters.map((c) => c.order_no);
    if (new Set(orderNos).size !== orderNos.length) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, 'order_no 不能重复');
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.replace) {
        await tx.chapter.deleteMany({ where: { bookId } });
      }
      await tx.chapter.createMany({
        data: dto.chapters.map((c) => ({
          bookId,
          orderNo: c.order_no,
          title: c.title,
          startPage: c.start_page ?? null,
          endPage: c.end_page ?? null,
          contentSummary: c.content_summary ?? null,
          contentFull: c.content_full ?? null,
        })),
      });
    });

    await this.adminLog.record({
      adminId,
      action: 'book.import_chapters',
      targetType: 'book',
      targetId: bookId,
      meta: { count: dto.chapters.length, replace: !!dto.replace },
    });

    const total = await this.prisma.chapter.count({ where: { bookId } });
    return { imported: dto.chapters.length, total };
  }

  // ===== 内部 =====

  private async findOrThrow(bookId: bigint): Promise<Book> {
    const book = await this.prisma.book.findUnique({ where: { id: bookId } });
    if (!book) throw new NotFoundBusinessException('书籍不存在');
    return book;
  }

  private toView(b: Book, chaptersCount: number): AdminBookView {
    return {
      id: b.id.toString(),
      title: b.title,
      author: b.author,
      isbn: b.isbn,
      description: b.description,
      cover_url: b.coverUrl,
      pdf_url: b.pdfUrl,
      pdf_pages: b.pdfPages,
      category: b.category,
      tags: b.tags ?? null,
      source: b.source,
      copyright_status: b.copyrightStatus,
      status: b.status,
      is_recommended: b.isRecommended === 1,
      sort_weight: b.sortWeight,
      created_by: b.createdBy.toString(),
      created_at: b.createdAt.toISOString(),
      updated_at: b.updatedAt.toISOString(),
      chapters_count: chaptersCount,
    };
  }

  private toChapterView(c: Chapter): ChapterAdminView {
    return {
      id: c.id.toString(),
      order_no: c.orderNo,
      title: c.title,
      start_page: c.startPage,
      end_page: c.endPage,
      content_summary: c.contentSummary,
      content_length: c.contentFull?.length ?? 0,
    };
  }
}

export interface ChapterAdminView {
  id: string;
  order_no: number;
  title: string;
  start_page: number | null;
  end_page: number | null;
  content_summary: string | null;
  content_length: number;
}
