/**
 * 在线阅读(M8)
 *
 * 入参:?bookId=xxx[&chapterId=xxx]
 * 流程:
 *   1. 拿 book detail → 取章节列表
 *   2. 默认打开第一章 / 入参指定的章节
 *   3. /v1/chapters/:id/full 拉正文渲染
 *   4. 上一章 / 下一章按 order_no 移动
 *   5. "就这章出题" → 走 paperStore.setPendingSource(chapter) → /pages/paper-config/
 */

import { HttpError, bookService } from '../../services/index';
import type { ChapterFull } from '../../services/book';
import { paperStore } from '../../stores/paper';
import { hideLoading, showLoading, toast } from '../../utils/toast';

interface ChapterRef {
  id: string;
  order_no: number;
  title: string;
}

interface PageData {
  loading: boolean;
  bookId: string;
  bookTitle: string;
  chapters: ChapterRef[];
  currentChapterId: string;
  currentTitle: string;
  currentOrderNo: number;
  currentSummary: string | null;
  currentContent: string;
  hasPrev: boolean;
  hasNext: boolean;
  tocOpen: boolean;
}

interface PageMethods {
  loadBook: (bookId: string, initialChapterId?: string) => Promise<void>;
  loadChapter: (chapterId: string) => Promise<void>;
  onToggleToc: () => void;
  onPickChapter: (e: WechatMiniprogram.BaseEvent) => void;
  onPrev: () => void;
  onNext: () => void;
  onMakePaper: () => void;
}

Page<PageData, PageMethods>({
  data: {
    loading: true,
    bookId: '',
    bookTitle: '',
    chapters: [],
    currentChapterId: '',
    currentTitle: '',
    currentOrderNo: 0,
    currentSummary: null,
    currentContent: '',
    hasPrev: false,
    hasNext: false,
    tocOpen: false,
  },

  onLoad(options) {
    const bookId = options?.bookId ?? '';
    const initialChapterId = options?.chapterId ?? '';
    if (!bookId) {
      toast('参数缺失', 'error');
      wx.navigateBack();
      return;
    }
    this.setData({ bookId });
    void this.loadBook(bookId, initialChapterId);
  },

  async loadBook(bookId, initialChapterId) {
    this.setData({ loading: true });
    try {
      const detail = await bookService.detail(bookId);
      const chapters: ChapterRef[] = (detail.chapters ?? []).map((c) => ({
        id: c.id,
        order_no: c.order_no,
        title: c.title,
      }));
      this.setData({
        bookTitle: detail.book.title,
        chapters,
      });
      if (chapters.length === 0) {
        this.setData({ loading: false });
        return;
      }
      const target =
        chapters.find((c) => c.id === initialChapterId) ?? chapters[0];
      await this.loadChapter(target.id);
    } catch (err) {
      this.setData({ loading: false });
      if (err instanceof HttpError) toast(err.message, 'error');
      else toast('加载失败', 'error');
    }
  },

  async loadChapter(chapterId) {
    showLoading('加载章节');
    try {
      const c: ChapterFull = await bookService.chapterFull(chapterId);
      hideLoading();
      const idx = this.data.chapters.findIndex((x) => x.id === chapterId);
      this.setData({
        loading: false,
        currentChapterId: chapterId,
        currentTitle: c.title,
        currentOrderNo: c.order_no,
        currentSummary: c.content_summary,
        currentContent: c.content_full,
        hasPrev: idx > 0,
        hasNext: idx >= 0 && idx < this.data.chapters.length - 1,
        tocOpen: false,
      });
      wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    } catch (err) {
      hideLoading();
      if (err instanceof HttpError) toast(err.message, 'error');
      else toast('加载章节失败', 'error');
    }
  },

  onToggleToc() {
    this.setData({ tocOpen: !this.data.tocOpen });
  },

  onPickChapter(e) {
    const id = (e.currentTarget.dataset as { id?: string }).id ?? '';
    if (!id || id === this.data.currentChapterId) {
      this.setData({ tocOpen: false });
      return;
    }
    void this.loadChapter(id);
  },

  onPrev() {
    const idx = this.data.chapters.findIndex(
      (c) => c.id === this.data.currentChapterId,
    );
    if (idx > 0) void this.loadChapter(this.data.chapters[idx - 1].id);
  },

  onNext() {
    const idx = this.data.chapters.findIndex(
      (c) => c.id === this.data.currentChapterId,
    );
    if (idx >= 0 && idx < this.data.chapters.length - 1) {
      void this.loadChapter(this.data.chapters[idx + 1].id);
    }
  },

  onMakePaper() {
    if (!this.data.currentChapterId) return;
    paperStore.setPendingSource({
      source_type: 'chapter',
      book_id: this.data.bookId,
      chapter_ids: [this.data.currentChapterId],
      book_title: this.data.bookTitle,
    });
    wx.navigateTo({ url: '/pages/paper-config/index' });
  },
});
