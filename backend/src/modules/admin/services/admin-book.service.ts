import { Injectable, Logger } from '@nestjs/common';
import { type Book, BookImportStatus, BookSource, type Chapter, type Prisma } from '@prisma/client';

import {
  BusinessException,
  NotFoundBusinessException,
} from '../../../common/exceptions/business.exception';
import { ERROR_CODES } from '../../../common/constants/error-codes';
import { AiService } from '../../../infra/ai-service/ai-service.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';

import type {
  CreateBookDto,
  CreateBookFromPhotoSetDto,
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
  tags: unknown;
  source: BookSource;
  copyright_status: string | null;
  status: number;
  is_recommended: boolean;
  sort_weight: number;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  chapters_count: number;
}

@Injectable()
export class AdminBookService {
  private readonly logger = new Logger(AdminBookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
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
    if (query.source && query.source !== 'all') {
      where.source = query.source as BookSource;
    }
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
        include: {
          _count: { select: { chapters: true } },
          creator: { select: { nickname: true, username: true } },
        },
      }),
    ]);

    return {
      list: rows.map((b) =>
        this.toView(b, b._count.chapters, b.creator?.nickname ?? b.creator?.username ?? null),
      ),
      pagination: { page: query.page, page_size: query.page_size, total },
    };
  }

  async detail(
    bookId: bigint,
    includeChapterFull = false,
  ): Promise<AdminBookView & { chapters: ChapterAdminView[] }> {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      include: {
        chapters: { orderBy: { orderNo: 'asc' } },
        creator: { select: { nickname: true, username: true } },
      },
    });
    if (!book) throw new NotFoundBusinessException('书籍不存在');
    return {
      ...this.toView(
        book,
        book.chapters.length,
        book.creator?.nickname ?? book.creator?.username ?? null,
      ),
      chapters: book.chapters.map((c) => this.toChapterView(c, includeChapterFull)),
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

  // ===== M8: PDF 自动入章节 =====

  /**
   * POST /v1/admin/books/:id/import-pdf
   *
   * 流程:
   *   1. 取 book.pdfUrl(或入参 pdfUrl 覆盖)
   *   2. ai-service.extractDocument({url, kind:'pdf'}) → markdown + chapter_hints
   *   3. ai-service.splitChapters(markdown, hints, book.title) → chapters[]
   *   4. 整体替换 book 的 chapters
   */
  async importPdfToChapters(
    adminId: bigint,
    bookId: bigint,
    pdfUrlOverride?: string | null,
    maxChapters?: number,
  ): Promise<{ imported: number; total: number; pages: number; chapter_hints: number }> {
    const book = await this.findOrThrow(bookId);
    const pdfUrl = pdfUrlOverride?.trim() || book.pdfUrl;
    if (!pdfUrl) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, '该书未关联 PDF, 请先填 pdf_url');
    }

    this.logger.log(`importPdfToChapters book=${bookId} pdf=${pdfUrl}`);

    const doc = await this.aiService.extractDocument({ url: pdfUrl, kind: 'pdf' });
    if (!doc.markdown.trim()) {
      throw new BusinessException(
        ERROR_CODES.LLM_UNAVAILABLE,
        'PDF 抽取不到文字, 大概率是扫描版 PDF;请改用拍照上传或先 OCR 转文字版',
      );
    }

    const split = await this.aiService.splitChapters({
      markdown: doc.markdown,
      chapter_hints: doc.chapter_hints ?? [],
      book_title: book.title,
      max_chapters: maxChapters,
    });

    if (!split.chapters?.length) {
      throw new BusinessException(ERROR_CODES.LLM_UNAVAILABLE, 'AI 未能切出任何章节');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.chapter.deleteMany({ where: { bookId } });
      await tx.chapter.createMany({
        data: split.chapters.map((c, idx) => ({
          bookId,
          orderNo: c.order_no || idx + 1,
          title: (c.title ?? `第 ${idx + 1} 章`).slice(0, 200),
          contentSummary: c.content_summary ?? null,
          contentFull: c.content_full ?? null,
        })),
      });
      // 同步 PDF 总页数
      await tx.book.update({
        where: { id: bookId },
        data: { pdfPages: doc.pages.length, pdfUrl },
      });
    });

    await this.adminLog.record({
      adminId,
      action: 'book.import_pdf',
      targetType: 'book',
      targetId: bookId,
      meta: {
        pdf_url: pdfUrl,
        pages: doc.pages.length,
        chapters: split.chapters.length,
        usage: split.usage as Prisma.InputJsonValue | null,
      } as Prisma.InputJsonValue,
    });

    const total = await this.prisma.chapter.count({ where: { bookId } });
    return {
      imported: split.chapters.length,
      total,
      pages: doc.pages.length,
      chapter_hints: doc.chapter_hints?.length ?? 0,
    };
  }

  // ===== 从拍照集创建书籍 =====

  async createFromPhotoSet(
    adminId: bigint,
    dto: CreateBookFromPhotoSetDto,
  ): Promise<AdminBookView & { import_status: string }> {
    const setId = BigInt(dto.photo_set_id);
    const set = await this.prisma.photoSet.findUnique({ where: { id: setId } });
    if (!set) throw new NotFoundBusinessException('拍照集不存在');

    const ocrText = (set.ocrText ?? '').trim();
    if (!ocrText) {
      throw new BusinessException(
        ERROR_CODES.PARAM_INVALID,
        '该拍照集尚未完成 OCR 识别, 请先进行识别或校对',
      );
    }

    const book = await this.prisma.book.create({
      data: {
        title: dto.title,
        author: dto.author ?? null,
        description: dto.description ?? `来自拍照集 #${dto.photo_set_id} 的 AI 整理`,
        coverUrl: dto.cover_url ?? null,
        pdfUrl: null,
        tags: (dto.tags ?? ['拍照']) as Prisma.InputJsonValue,
        source: BookSource.admin,
        copyrightStatus: dto.copyright_status ?? null,
        status: 1,
        isRecommended: 0,
        sortWeight: 0,
        createdBy: adminId,
        linkedPhotoSetId: setId,
        importStatus: BookImportStatus.splitting,
        importProgress: 10,
        importUpdatedAt: new Date(),
      },
    });

    await this.adminLog.record({
      adminId,
      action: 'book.create_from_photo_set',
      targetType: 'book',
      targetId: book.id,
      meta: { photo_set_id: dto.photo_set_id, title: dto.title },
    });

    this.schedulePhotoSetChapterSplit(adminId, book.id, setId, dto.title);

    return { ...this.toView(book, 0), import_status: book.importStatus };
  }

  async importFromPhotoSet(
    adminId: bigint,
    bookId: bigint,
    photoSetId: bigint,
  ): Promise<{ imported: number; total: number }> {
    const book = await this.findOrThrow(bookId);
    const set = await this.prisma.photoSet.findUnique({ where: { id: photoSetId } });
    if (!set) throw new NotFoundBusinessException('拍照集不存在');

    const ocrText = (set.ocrText ?? '').trim();
    if (!ocrText) {
      throw new BusinessException(
        ERROR_CODES.PARAM_INVALID,
        '该拍照集尚未完成 OCR 识别, 请先进行识别或校对',
      );
    }

    const split = await this.aiService.splitChapters({
      markdown: ocrText,
      chapter_hints: [],
      book_title: book.title,
    });

    if (!split.chapters?.length) {
      throw new BusinessException(ERROR_CODES.LLM_UNAVAILABLE, 'AI 未能从拍照集文本中切出任何章节');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.chapter.deleteMany({ where: { bookId } });
      await tx.chapter.createMany({
        data: split.chapters.map((c, idx) => ({
          bookId,
          orderNo: c.order_no || idx + 1,
          title: (c.title ?? `第 ${idx + 1} 章`).slice(0, 200),
          contentSummary: c.content_summary ?? null,
          contentFull: c.content_full ?? null,
        })),
      });
      await tx.book.update({
        where: { id: bookId },
        data: { linkedPhotoSetId: photoSetId },
      });
    });

    await this.adminLog.record({
      adminId,
      action: 'book.import_from_photo_set',
      targetType: 'book',
      targetId: bookId,
      meta: {
        photo_set_id: photoSetId.toString(),
        chapters: split.chapters.length,
      },
    });

    const total = await this.prisma.chapter.count({ where: { bookId } });
    return { imported: split.chapters.length, total };
  }

  private schedulePhotoSetChapterSplit(
    adminId: bigint,
    bookId: bigint,
    photoSetId: bigint,
    bookTitle: string,
  ): void {
    setImmediate(() => {
      this.runPhotoSetChapterSplit(adminId, bookId, photoSetId, bookTitle).catch((err) => {
        this.logger.error(
          `runPhotoSetChapterSplit 异常 book=${bookId} err=${(err as Error).message}`,
        );
      });
    });
  }

  private async runPhotoSetChapterSplit(
    _adminId: bigint,
    bookId: bigint,
    photoSetId: bigint,
    bookTitle: string,
  ): Promise<void> {
    try {
      const set = await this.prisma.photoSet.findUnique({ where: { id: photoSetId } });
      if (!set) throw new Error('拍照集已不存在');

      const markdown = (set.ocrText ?? '').trim();
      if (!markdown) throw new Error('拍照集无 OCR 文本');

      await this.prisma.book.update({
        where: { id: bookId },
        data: { importProgress: 40, importUpdatedAt: new Date() },
      });

      const split = await this.aiService.splitChapters({
        markdown,
        chapter_hints: [],
        book_title: bookTitle,
      });

      if (!split.chapters?.length) throw new Error('AI 未能切出任何章节');

      await this.prisma.$transaction(async (tx) => {
        await tx.chapter.deleteMany({ where: { bookId } });
        await tx.chapter.createMany({
          data: split.chapters.map((c, idx) => ({
            bookId,
            orderNo: c.order_no || idx + 1,
            title: (c.title ?? `第 ${idx + 1} 章`).slice(0, 200),
            contentSummary: c.content_summary ?? null,
            contentFull: c.content_full ?? null,
          })),
        });
        await tx.book.update({
          where: { id: bookId },
          data: {
            importStatus: BookImportStatus.ready,
            importProgress: 100,
            importError: null,
            importUpdatedAt: new Date(),
          },
        });
      });

      this.logger.log(
        `runPhotoSetChapterSplit ok book=${bookId} chapters=${split.chapters.length}`,
      );
    } catch (err) {
      const msg = (err as Error)?.message ?? '未知错误';
      this.logger.warn(`runPhotoSetChapterSplit 失败 book=${bookId} err=${msg}`);
      await this.prisma.book
        .update({
          where: { id: bookId },
          data: {
            importStatus: BookImportStatus.failed,
            importError: msg.slice(0, 1000),
            importUpdatedAt: new Date(),
          },
        })
        .catch(() => undefined);
    }
  }

  // ===== 内部 =====

  private async findOrThrow(bookId: bigint): Promise<Book> {
    const book = await this.prisma.book.findUnique({ where: { id: bookId } });
    if (!book) throw new NotFoundBusinessException('书籍不存在');
    return book;
  }

  private toView(
    b: Book,
    chaptersCount: number,
    createdByName: string | null = null,
  ): AdminBookView {
    return {
      id: b.id.toString(),
      title: b.title,
      author: b.author,
      isbn: b.isbn,
      description: b.description,
      cover_url: b.coverUrl,
      pdf_url: b.pdfUrl,
      pdf_pages: b.pdfPages,
      tags: b.tags ?? null,
      source: b.source,
      copyright_status: b.copyrightStatus,
      status: b.status,
      is_recommended: b.isRecommended === 1,
      sort_weight: b.sortWeight,
      created_by: b.createdBy.toString(),
      created_by_name: createdByName,
      created_at: b.createdAt.toISOString(),
      updated_at: b.updatedAt.toISOString(),
      chapters_count: chaptersCount,
    };
  }

  private toChapterView(c: Chapter, includeFull = false): ChapterAdminView {
    const row: ChapterAdminView = {
      id: c.id.toString(),
      order_no: c.orderNo,
      title: c.title,
      start_page: c.startPage,
      end_page: c.endPage,
      content_summary: c.contentSummary,
      content_length: c.contentFull?.length ?? 0,
    };
    if (includeFull) {
      row.content_full = c.contentFull ?? null;
    }
    return row;
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
  /** include_chapter_full=1 时返回正文片段 */
  content_full?: string | null;
}
