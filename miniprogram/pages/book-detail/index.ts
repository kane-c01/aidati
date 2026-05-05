/**
 * U04 书籍详情
 *
 * 用户在此可:
 *  - 查看书籍简介 / 章节
 *  - 点章节多选(可不选 = 整本书)
 *  - 点底部按钮 → 把 source/书 ID/章节 ID 送给 paperStore, 跳 paper-config
 */

import { bookService, HttpError } from '../../services/index';
import { paperStore } from '../../stores/paper';
import { track } from '../../utils/tracker';
import type { Book, Chapter } from '../../types/domain';

Page<
  {
    bookId: string;
    book: Book | null;
    chapters: Chapter[];
    selectedChapterIds: Record<string, boolean>;
    selectedCount: number;
    descExpanded: boolean;
    loading: boolean;
    errorMsg: string;
  },
  {
    onToggleDesc: () => void;
    onChapterTap: (e: WechatMiniprogram.BaseEvent) => void;
    onStartGenerate: () => void;
    onRetry: () => void;
    fetch: () => Promise<void>;
  }
>({
  data: {
    bookId: '',
    book: null,
    chapters: [],
    selectedChapterIds: {},
    selectedCount: 0,
    descExpanded: false,
    loading: true,
    errorMsg: '',
  },

  onLoad(options) {
    const id = options?.bookId ?? '';
    if (!id) {
      this.setData({ loading: false, errorMsg: '缺少书籍 ID' });
      return;
    }
    this.setData({ bookId: id });
    void this.fetch();
  },

  onShareAppMessage() {
    if (!this.data.book) return { title: 'AI 智能出题学习', path: '/pages/home/index' };
    return {
      title: `《${this.data.book.title}》 - AI 出题学习`,
      path: `/pages/book-detail/index?bookId=${encodeURIComponent(this.data.bookId)}&from=share`,
    };
  },

  async fetch() {
    this.setData({ loading: true, errorMsg: '' });
    try {
      const res = await bookService.detail(this.data.bookId);
      this.setData({
        book: res.book,
        chapters: res.chapters,
        loading: false,
      });
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : '加载失败';
      this.setData({ loading: false, errorMsg: msg });
    }
  },

  onRetry() {
    void this.fetch();
  },

  onToggleDesc() {
    this.setData({ descExpanded: !this.data.descExpanded });
  },

  onChapterTap(e) {
    const id = e.currentTarget.dataset.id as string;
    const map = { ...this.data.selectedChapterIds };
    if (map[id]) delete map[id];
    else map[id] = true;
    this.setData({
      selectedChapterIds: map,
      selectedCount: Object.keys(map).length,
    });
  },

  onStartGenerate() {
    const ids = Object.keys(this.data.selectedChapterIds);
    const sourceType = ids.length > 0 ? 'chapter' : 'book';
    track('book_start_generate', { source_type: sourceType, chapter_count: ids.length });

    paperStore.setPendingSource({
      source_type: sourceType,
      book_id: this.data.bookId,
      chapter_ids: ids.length > 0 ? ids : undefined,
      book_title: this.data.book?.title ?? null,
    });

    wx.navigateTo({ url: '/pages/paper-config/index' });
  },
});
