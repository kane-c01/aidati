import { Injectable, Logger } from '@nestjs/common';
import { type Book, BookImportStatus, BookSource, type Chapter, Prisma } from '@prisma/client';

import { ERROR_CODES } from '../../common/constants/error-codes';
import {
  BusinessException,
  NotFoundBusinessException,
} from '../../common/exceptions/business.exception';
import { AiService } from '../../infra/ai-service/ai-service.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { FavoriteService } from '../favorite/favorite.service';
import { PhotoService } from '../photo/photo.service';

import type { ListBooksQuery } from './dto/list-books.query';

export interface BookListItem {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  description: string | null;
  tags: unknown;
  is_recommended: boolean;
  /** V2:用户是否收藏(MVP 始终 false)*/
  is_favorited: boolean;
  /** M8 异步抽章状态 */
  import_status: BookImportStatus;
  import_progress: number;
  import_error: string | null;
  /** M8 PR2.6: 上传 PDF 自建书时双写生成的可校对 photo_set;前端可用此跳到拍照 OCR 流程 */
  linked_photo_set_id: string | null;
}

export interface BookDetailBook extends BookListItem {
  isbn: string | null;
  pdf_url: string | null;
  pdf_pages: number | null;
  copyright_status: string | null;
  source: string;
  created_at: string;
}

export interface BookDetailView {
  book: BookDetailBook;
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly favorite: FavoriteService,
    private readonly aiService: AiService,
    private readonly photoService: PhotoService,
  ) {}

  // ===== GET /v1/books =====

  async listForUser(
    query: ListBooksQuery,
    userId?: bigint,
  ): Promise<{
    list: BookListItem[];
    pagination: { page: number; page_size: number; total: number };
  }> {
    /**
     * 可见性规则(M8 用户上传书后):
     * - status=1 + 未删除
     * - source ∈ [admin, public_domain]: 全员可见
     * - source = user_upload:
     *     - owner == 当前用户  → 自己可见
     *     - is_recommended = 1 → 管理员推荐到主页, 全员可见
     *     - 否则不出现在公开列表
     */
    const visibility: Prisma.BookWhereInput = userId
      ? {
          OR: [
            { source: { in: [BookSource.admin, BookSource.public_domain] } },
            { source: BookSource.user_upload, createdBy: userId },
            { source: BookSource.user_upload, isRecommended: 1 },
          ],
        }
      : {
          OR: [
            { source: { in: [BookSource.admin, BookSource.public_domain] } },
            { source: BookSource.user_upload, isRecommended: 1 },
          ],
        };

    const where: Prisma.BookWhereInput = {
      status: 1,
      deletedAt: null,
      ...visibility,
    };
    if (query.keyword && query.keyword.trim().length > 0) {
      const kw = query.keyword.trim();
      where.AND = [
        {
          OR: [
            { title: { contains: kw } },
            { author: { contains: kw } },
            { isbn: { contains: kw } },
          ],
        },
      ];
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

    const favSet = userId
      ? await this.favorite.findFavoritedBookIds(
          userId,
          rows.map((b) => b.id),
        )
      : new Set<string>();

    return {
      list: rows.map((b) => this.toListItem(b, favSet.has(b.id.toString()))),
      pagination: { page: query.page, page_size: query.page_size, total },
    };
  }

  // ===== GET /v1/books/:id =====

  async getDetail(bookId: bigint, userId?: bigint): Promise<BookDetailView> {
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
    // user_upload 隐私校验:非 owner + 未推荐 → 视为不存在
    if (book.source === BookSource.user_upload && book.isRecommended !== 1) {
      if (!userId || book.createdBy !== userId) {
        throw new NotFoundBusinessException('书籍不存在或未上架');
      }
    }
    const favSet = userId
      ? await this.favorite.findFavoritedBookIds(userId, [book.id])
      : new Set<string>();
    return this.toDetail(book, book.chapters, favSet.has(book.id.toString()));
  }

  // ===== GET /v1/chapters/:id =====

  async getChapterDetail(chapterId: bigint, userId?: bigint): Promise<ChapterDetailView> {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { book: true },
    });
    if (!chapter || chapter.book.status !== 1 || chapter.book.deletedAt) {
      throw new NotFoundBusinessException('章节不存在或未上架');
    }
    // user_upload 隐私校验:与 getChapterFull 保持一致, 防止 IDOR
    const b = chapter.book;
    if (b.source === BookSource.user_upload && b.isRecommended !== 1) {
      if (!userId || b.createdBy !== userId) {
        throw new NotFoundBusinessException('章节不存在或未上架');
      }
    }
    return {
      ...this.toChapterBrief(chapter),
      book_id: chapter.bookId.toString(),
      content_summary: chapter.contentSummary,
    };
  }

  /**
   * GET /v1/chapters/:id/full —— 在线阅读用,返回正文
   * 校验:章节必须可见(同 getDetail 规则)
   */
  async getChapterFull(
    chapterId: bigint,
    userId?: bigint,
  ): Promise<{
    id: string;
    book_id: string;
    book_title: string;
    order_no: number;
    title: string;
    content_full: string;
    content_summary: string | null;
  }> {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { book: true },
    });
    if (!chapter || chapter.book.status !== 1 || chapter.book.deletedAt) {
      throw new NotFoundBusinessException('章节不存在或未上架');
    }
    const b = chapter.book;
    if (b.source === BookSource.user_upload && b.isRecommended !== 1) {
      if (!userId || b.createdBy !== userId) {
        throw new NotFoundBusinessException('章节不存在或未上架');
      }
    }
    return {
      id: chapter.id.toString(),
      book_id: b.id.toString(),
      book_title: b.title,
      order_no: chapter.orderNo,
      title: chapter.title,
      content_full: chapter.contentFull ?? '',
      content_summary: chapter.contentSummary,
    };
  }

  // ===== 我的书库(M8 用户上传书)=====

  /**
   * GET /v1/books/mine —— 列出当前用户上传的书
   */
  async listMine(
    userId: bigint,
    page = 1,
    pageSize = 20,
  ): Promise<{
    list: Array<
      BookListItem & {
        chapters_count: number;
        pdf_url: string | null;
        created_at: string;
      }
    >;
    pagination: { page: number; page_size: number; total: number };
  }> {
    const where: Prisma.BookWhereInput = {
      createdBy: userId,
      source: BookSource.user_upload,
      deletedAt: null,
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.book.count({ where }),
      this.prisma.book.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { chapters: true } } },
      }),
    ]);
    return {
      list: rows.map((b) => ({
        ...this.toListItem(b, false),
        chapters_count: b._count.chapters,
        pdf_url: b.pdfUrl,
        created_at: b.createdAt.toISOString(),
      })),
      pagination: { page, page_size: pageSize, total },
    };
  }

  /**
   * POST /v1/books/upload —— 用户上传 PDF 自建书(异步, 双写)
   *
   * 流程:
   *   1. 同步创建 Book + importStatus=preparing,立即返回 detail
   *   2. setImmediate 后台并发跑两个任务:
   *      a) processBookPdf: pdfplumber + LLM 切章 → ready (供"出题"使用)
   *      b) buildPhotoSetForBook: PDF 拆图 → photo_set + photos (供"逐页校对 / OCR"使用)
   *   3. 任一失败 → 仅影响那一路;两路互不阻塞
   *   4. 前端"我的书库"轮询 listMine 拿 importStatus + linkedPhotoSetId
   */
  async uploadUserBook(
    userId: bigint,
    dto: {
      title: string;
      author?: string;
      cover_url?: string;
      pdf_url: string;
      description?: string;
      max_chapters?: number;
    },
  ): Promise<BookDetailView> {
    const book = await this.prisma.book.create({
      data: {
        title: dto.title.trim(),
        author: dto.author?.trim() || null,
        coverUrl: dto.cover_url ?? null,
        pdfUrl: dto.pdf_url,
        description: dto.description?.trim() || null,
        source: BookSource.user_upload,
        status: 1,
        isRecommended: 0,
        sortWeight: 0,
        createdBy: userId,
        tags: [] as Prisma.InputJsonValue,
        importStatus: BookImportStatus.preparing,
        importProgress: 0,
        importUpdatedAt: new Date(),
      },
    });

    this.scheduleBookImport(book.id, dto.pdf_url, dto.max_chapters);
    // M8 PR2.6: 双写 photo_set, 错误不阻断主流程
    this.scheduleBuildPhotoSetForBook(userId, book.id, dto.pdf_url, dto.title.trim());

    const fresh = await this.prisma.book.findUnique({
      where: { id: book.id },
      include: { chapters: { orderBy: { orderNo: 'asc' } } },
    });
    return this.toDetail(fresh!, fresh!.chapters, false);
  }

  /**
   * M8 PR2.6: 后台异步双写——把 Book 的 PDF 拆成图片建一个 photo_set
   *
   * 失败仅打日志, 不影响"自建书"的主流程; 用户照样能看到书+章节, 只是没拍照集校对入口。
   */
  private scheduleBuildPhotoSetForBook(
    userId: bigint,
    bookId: bigint,
    pdfUrl: string,
    bookTitle: string,
  ): void {
    setImmediate(() => {
      this.runBuildPhotoSetForBook(userId, bookId, pdfUrl, bookTitle).catch((err) => {
        this.logger.warn(
          `runBuildPhotoSetForBook 失败 book=${bookId} err=${(err as Error)?.message ?? err}`,
        );
      });
    });
  }

  private async runBuildPhotoSetForBook(
    userId: bigint,
    bookId: bigint,
    pdfUrl: string,
    bookTitle: string,
  ): Promise<void> {
    const res = await this.photoService.createSetFromPdf(
      userId,
      { pdf_url: pdfUrl, name: `${bookTitle} · 原始页面` },
      { sourceKind: 'book', sourceBookId: bookId },
    );
    await this.prisma.book.update({
      where: { id: bookId },
      data: { linkedPhotoSetId: BigInt(res.photo_set_id) },
    });
    this.logger.log(
      `runBuildPhotoSetForBook ok book=${bookId} photo_set=${res.photo_set_id} pages=${res.photos.length}`,
    );
  }

  /** 后台异步抽章调度(简化版, 适合 1-2 用户量;生产建议 BullMQ + Redis) */
  private scheduleBookImport(bookId: bigint, pdfUrl: string, maxChapters?: number): void {
    setImmediate(() => {
      this.runBookImport(bookId, pdfUrl, maxChapters).catch((err) => {
        this.logger.error(`runBookImport 异常 book=${bookId} err=${(err as Error).message}`);
      });
    });
  }

  private async runBookImport(bookId: bigint, pdfUrl: string, maxChapters?: number): Promise<void> {
    try {
      await this.prisma.book.update({
        where: { id: bookId },
        data: {
          importStatus: BookImportStatus.extracting,
          importProgress: 10,
          importUpdatedAt: new Date(),
        },
      });
      const result = await this.processBookPdf(bookId, pdfUrl, maxChapters);
      await this.prisma.book.update({
        where: { id: bookId },
        data: {
          importStatus: BookImportStatus.ready,
          importProgress: 100,
          importError: null,
          importUpdatedAt: new Date(),
        },
      });
      this.logger.log(
        `runBookImport ok book=${bookId} pages=${result.pages} chapters=${result.imported}`,
      );
    } catch (err) {
      const msg = (err as Error)?.message ?? '未知错误';
      this.logger.warn(`runBookImport 失败 book=${bookId} err=${msg}`);
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

  /** 后台异步:photo_set → book(没有 PDF, 直接 split chapters) */
  private schedulePhotoSetImport(bookId: bigint, photoSetId: bigint, bookTitle: string): void {
    setImmediate(() => {
      this.runPhotoSetImport(bookId, photoSetId, bookTitle).catch((err) => {
        this.logger.error(`runPhotoSetImport 异常 book=${bookId} err=${(err as Error).message}`);
      });
    });
  }

  private async runPhotoSetImport(
    bookId: bigint,
    photoSetId: bigint,
    bookTitle: string,
  ): Promise<void> {
    try {
      const set = await this.prisma.photoSet.findUnique({ where: { id: photoSetId } });
      if (!set) throw new Error('拍照集已不存在');
      await this.prisma.book.update({
        where: { id: bookId },
        data: {
          importStatus: BookImportStatus.splitting,
          importProgress: 20,
          importUpdatedAt: new Date(),
        },
      });
      const markdown = (set.ocrText ?? '').trim();
      if (!markdown) {
        throw new Error('该拍照集还没有识别到文字, 请先框选或 AI 识别后再保存为书');
      }
      const split = await this.aiService.splitChapters({
        markdown,
        chapter_hints: [],
        book_title: bookTitle,
      });
      if (!split.chapters?.length) {
        throw new Error('AI 未能切出任何章节');
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
          data: {
            importStatus: BookImportStatus.ready,
            importProgress: 100,
            importError: null,
            importUpdatedAt: new Date(),
          },
        });
      });
      this.logger.log(`runPhotoSetImport ok book=${bookId} chapters=${split.chapters.length}`);
    } catch (err) {
      const msg = (err as Error)?.message ?? '未知错误';
      this.logger.warn(`runPhotoSetImport 失败 book=${bookId} err=${msg}`);
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

  /**
   * PATCH /v1/books/:id —— 用户改自己的书(只能改 title / cover_url / description)
   */
  async patchMyBook(
    userId: bigint,
    bookId: bigint,
    dto: { title?: string; author?: string; cover_url?: string; description?: string },
  ): Promise<BookDetailView> {
    const book = await this.findMyOrThrow(userId, bookId);
    await this.prisma.book.update({
      where: { id: bookId },
      data: {
        title: dto.title?.trim() ?? book.title,
        author: dto.author === undefined ? book.author : dto.author.trim() || null,
        coverUrl: dto.cover_url === undefined ? book.coverUrl : dto.cover_url || null,
        description:
          dto.description === undefined ? book.description : dto.description.trim() || null,
      },
    });
    return this.getDetail(bookId, userId);
  }

  /**
   * POST /v1/books/from-photo-set —— 拍照集 → user_upload 书(异步)
   *
   * 同步部分:
   *   1. 校验 photo_set 属于当前用户 + 已有 ocr_text
   *   2. 创建 Book(importStatus=preparing) 立即返回
   * 异步部分:
   *   3. setImmediate 跑 splitChapters → 写 chapters → ready
   */
  async createBookFromPhotoSet(
    userId: bigint,
    photoSetId: bigint,
    dto: { title: string; author?: string; cover_url?: string; description?: string },
  ): Promise<BookDetailView> {
    const set = await this.prisma.photoSet.findUnique({ where: { id: photoSetId } });
    if (!set || set.userId !== userId) {
      throw new NotFoundBusinessException('拍照集不存在或不属于你');
    }
    if (!(set.ocrText ?? '').trim()) {
      throw new BusinessException(
        ERROR_CODES.PARAM_INVALID,
        '该拍照集还没有识别到文字, 请先框选 / AI 识别后再保存为书',
      );
    }

    const book = await this.prisma.book.create({
      data: {
        title: dto.title.trim(),
        author: dto.author?.trim() || null,
        coverUrl: dto.cover_url ?? null,
        pdfUrl: null,
        description: dto.description?.trim() || `来自拍照集 #${photoSetId} 的 AI 整理`,
        source: BookSource.user_upload,
        status: 1,
        isRecommended: 0,
        sortWeight: 0,
        createdBy: userId,
        tags: ['拍照'] as Prisma.InputJsonValue,
        importStatus: BookImportStatus.preparing,
        importProgress: 0,
        importUpdatedAt: new Date(),
      },
    });

    this.schedulePhotoSetImport(book.id, photoSetId, dto.title.trim());

    const fresh = await this.prisma.book.findUnique({
      where: { id: book.id },
      include: { chapters: { orderBy: { orderNo: 'asc' } } },
    });
    return this.toDetail(fresh!, fresh!.chapters, false);
  }

  /**
   * DELETE /v1/books/:id —— 用户软删自己的书
   *
   * 同步把双写的 linkedPhotoSet 的 expires_at 改回 +7 天, 让定时清理任务自然回收。
   * 这样:
   *  - 用户立刻看不到这本书
   *  - 关联 photo_set 暂保留 7 天给"反悔窗口", 7 天后由 expires_at 索引清理任务统一清掉
   */
  async deleteMyBook(userId: bigint, bookId: bigint): Promise<{ ok: true }> {
    const book = await this.findMyOrThrow(userId, bookId);
    await this.prisma.$transaction(async (tx) => {
      await tx.book.update({
        where: { id: bookId },
        data: { status: -1, deletedAt: new Date() },
      });
      if (book.linkedPhotoSetId) {
        await tx.photoSet.update({
          where: { id: book.linkedPhotoSetId },
          data: { expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
        });
      }
    });
    return { ok: true };
  }

  // ===== 共享 PDF 抽章逻辑(供 admin / user 共用)=====

  /**
   * 流水线:
   *   1. ai-service.extractDocument({url, kind:'pdf'}) → markdown + chapter_hints
   *   2. ai-service.splitChapters(markdown, hints, book.title) → chapters[]
   *   3. 整本书 chapters 整体替换(deleteMany + createMany)
   *
   * 副作用:同步 book.pdfUrl 与 book.pdfPages
   * 任何 LLM / pdfplumber 失败均抛 BusinessException(LLM_UNAVAILABLE)
   */
  async processBookPdf(
    bookId: bigint,
    pdfUrlOverride?: string | null,
    maxChapters?: number,
  ): Promise<{ pages: number; imported: number; chapter_hints: number }> {
    const book = await this.prisma.book.findUnique({ where: { id: bookId } });
    if (!book) throw new NotFoundBusinessException('书籍不存在');

    const pdfUrl = pdfUrlOverride?.trim() || book.pdfUrl;
    if (!pdfUrl) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, '该书未关联 PDF, 请先填 pdf_url');
    }

    this.logger.log(`processBookPdf book=${bookId} pdf=${pdfUrl.slice(-48)}`);

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
      await tx.book.update({
        where: { id: bookId },
        data: { pdfPages: doc.pages.length, pdfUrl },
      });
    });

    return {
      pages: doc.pages.length,
      imported: split.chapters.length,
      chapter_hints: doc.chapter_hints?.length ?? 0,
    };
  }

  // ===== 内部 =====

  /** 找当前用户拥有的书,否则 404 */
  private async findMyOrThrow(userId: bigint, bookId: bigint): Promise<Book> {
    const b = await this.prisma.book.findUnique({ where: { id: bookId } });
    if (!b || b.deletedAt || b.createdBy !== userId || b.source !== BookSource.user_upload) {
      throw new NotFoundBusinessException('书籍不存在或不属于你');
    }
    return b;
  }

  // ===== 私有辅助(原有)=====

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

  private toListItem(b: Book, isFavorited: boolean): BookListItem {
    return {
      id: b.id.toString(),
      title: b.title,
      author: b.author,
      cover_url: b.coverUrl,
      description: b.description,
      tags: b.tags ?? null,
      is_recommended: b.isRecommended === 1,
      is_favorited: isFavorited,
      import_status: b.importStatus,
      import_progress: b.importProgress,
      import_error: b.importError,
      linked_photo_set_id: b.linkedPhotoSetId !== null ? b.linkedPhotoSetId.toString() : null,
    };
  }

  private toDetail(b: Book, chapters: Chapter[], isFavorited: boolean): BookDetailView {
    return {
      book: {
        ...this.toListItem(b, isFavorited),
        isbn: b.isbn,
        pdf_url: b.pdfUrl,
        pdf_pages: b.pdfPages,
        copyright_status: b.copyrightStatus,
        source: b.source,
        created_at: b.createdAt.toISOString(),
      },
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
