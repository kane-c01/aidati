import { Injectable, Logger } from '@nestjs/common';
import { type Paper, PaperSourceType } from '@prisma/client';

import { ERROR_CODES } from '../../../common/constants/error-codes';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';

const MIN_CONTEXT_LEN = 10;
const MAX_CONTEXT_LEN = 60_000;

export interface PaperContext {
  context_text: string;
  book_title: string | null;
  chapter_titles: string[] | null;
}

/**
 * 出题上下文构建
 * 文档:01-技术架构 §2.1 / 03-API §7.1
 *
 * 三种 source_type 对应不同的文本来源:
 * - book      → book.description + 顶层章节摘要(若有)
 * - chapter   → 选中章节 contentFull(或 fallback contentSummary)拼接
 * - photo_set → photo_set.ocr_text 整体合并文本
 *
 * 上限 60k 字符:LLM 单次 prompt 限制 + 留出 system / 用户指令的余量
 */
@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async buildForPaper(paper: Paper): Promise<PaperContext> {
    switch (paper.sourceType) {
      case PaperSourceType.book:
        return this.buildForBook(paper);
      case PaperSourceType.chapter:
        return this.buildForChapter(paper);
      case PaperSourceType.photo_set:
        return this.buildForPhotoSet(paper);
      default:
        throw new BusinessException(
          ERROR_CODES.PARAM_INVALID,
          `不支持的 source_type: ${paper.sourceType}`,
        );
    }
  }

  // ===== book =====
  private async buildForBook(paper: Paper): Promise<PaperContext> {
    if (!paper.bookId) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, 'book 模式必须传 book_id');
    }
    const book = await this.prisma.book.findUnique({
      where: { id: paper.bookId },
      include: {
        chapters: {
          orderBy: { orderNo: 'asc' },
          take: 30,
        },
      },
    });
    if (!book || book.status !== 1) {
      throw new BusinessException(ERROR_CODES.RESOURCE_NOT_FOUND, '书籍不存在或已下架');
    }

    const chunks: string[] = [];
    if (book.description) chunks.push(`【书籍简介】\n${book.description}`);
    const summaries = book.chapters
      .map((ch) => {
        const body = ch.contentSummary ?? ch.contentFull?.slice(0, 1500) ?? '';
        return body ? `【第${ch.orderNo}章 ${ch.title}】\n${body}` : '';
      })
      .filter(Boolean);
    if (summaries.length > 0) chunks.push(summaries.join('\n\n'));

    const context = this.normalize(chunks.join('\n\n'));
    this.assertMinLen(context, '书籍内容不足以出题, 请选择章节或拍照模式');

    return {
      context_text: context,
      book_title: book.title,
      chapter_titles: null,
    };
  }

  // ===== chapter =====
  private async buildForChapter(paper: Paper): Promise<PaperContext> {
    if (!paper.chapterId) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, 'chapter 模式必须传 chapter_ids');
    }
    // MVP:Paper 表只关联单个 chapter_id;若前端选了多章, 由 PaperService 决定
    // 1) 拆多张 paper 或 2) 拼成一个 paper(我们走方案 2:把 chapter_id 当主章, 其它章 ID 走 config)
    const ids: bigint[] = [paper.chapterId];
    const config = paper.config as { extra_chapter_ids?: string[] } | null;
    for (const id of config?.extra_chapter_ids ?? []) {
      try {
        const big = BigInt(id);
        if (!ids.includes(big)) ids.push(big);
      } catch {
        /* 忽略非法 id */
      }
    }

    const chapters = await this.prisma.chapter.findMany({
      where: { id: { in: ids } },
      include: { book: true },
      orderBy: [{ bookId: 'asc' }, { orderNo: 'asc' }],
    });
    if (chapters.length === 0) {
      throw new BusinessException(ERROR_CODES.RESOURCE_NOT_FOUND, '章节不存在');
    }

    const context = chapters
      .map((ch) => {
        const body = ch.contentFull ?? ch.contentSummary ?? '';
        return body
          ? `【第${ch.orderNo}章 ${ch.title}】\n${body}`
          : `【第${ch.orderNo}章 ${ch.title}】\n(本章正文暂未导入, 请使用章节摘要出题)\n${ch.contentSummary ?? ''}`;
      })
      .join('\n\n');
    const normalized = this.normalize(context);
    this.assertMinLen(normalized, '章节内容不足以出题, 请补充原文或换素材');

    return {
      context_text: normalized,
      book_title: chapters[0].book?.title ?? null,
      chapter_titles: chapters.map((c) => c.title),
    };
  }

  // ===== photo_set =====
  private async buildForPhotoSet(paper: Paper): Promise<PaperContext> {
    if (!paper.photoSetId) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, 'photo_set 模式必须传 photo_set_id');
    }
    const set = await this.prisma.photoSet.findUnique({
      where: { id: paper.photoSetId },
      include: {
        photos: {
          orderBy: { orderNo: 'asc' },
        },
      },
    });
    if (!set || set.userId !== paper.userId) {
      throw new BusinessException(ERROR_CODES.RESOURCE_NOT_FOUND, '拍照集不存在');
    }
    if (set.expiresAt.getTime() < Date.now()) {
      throw new BusinessException(ERROR_CODES.RESOURCE_NOT_FOUND, '拍照集已过期');
    }

    const text =
      set.ocrText && set.ocrText.length > 0
        ? set.ocrText
        : set.photos
            .map((p) =>
              p.ocrText && p.ocrText.length > 0 ? `[第${p.orderNo}页]\n${p.ocrText}` : '',
            )
            .filter(Boolean)
            .join('\n\n');

    const normalized = this.normalize(text);
    this.assertMinLen(normalized, 'OCR 文本为空, 请先完成 OCR 识别 / 校对再出题');

    return {
      context_text: normalized,
      book_title: set.name,
      chapter_titles: null,
    };
  }

  // ===== 内部 =====

  private normalize(text: string): string {
    if (!text) return '';
    const cleaned = text
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (cleaned.length > MAX_CONTEXT_LEN) {
      this.logger.warn(`上下文超长 ${cleaned.length}, 截断到 ${MAX_CONTEXT_LEN}`);
      return cleaned.slice(0, MAX_CONTEXT_LEN);
    }
    return cleaned;
  }

  private assertMinLen(text: string, hint: string): void {
    if (text.length < MIN_CONTEXT_LEN) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, hint);
    }
  }
}
