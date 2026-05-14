/**
 * U04 书籍详情
 *
 * 用户在此可:
 *  - 查看书籍简介 / 章节
 *  - 点章节多选(可不选 = 整本书)
 *  - 底部双入口:
 *      · 在线阅读 → /pages/book-reader(若选中了章节,跳到第一个选中章)
 *      · 生成题目 → 把 source 写入 paperStore, 跳 /pages/paper-config
 *
 * 当书籍 import_status 不为 ready(用户上传书 AI 还在处理 / 失败)时, 两个按钮置灰。
 */

import { bookService, favoriteService, HttpError } from '../../services/index';
import { paperStore } from '../../stores/paper';
import { coverToneClass } from '../../utils/cover';
import { toast } from '../../utils/toast';
import { track } from '../../utils/tracker';
import type { Book, BookImportStatus, Chapter } from '../../types/domain';

const IMPORT_STATUS_LABEL: Record<BookImportStatus, string> = {
  preparing: 'AI 正在准备…',
  extracting: 'AI 正在抽取文字…',
  splitting: 'AI 正在切分章节…',
  ready: '',
  failed: 'AI 整理失败',
};

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
    favBusy: boolean;
    coverToneClass: string;
    readableChapterCount: number;
    importStatusLabel: string;
    actionsDisabled: boolean;
    readBtnLabel: string;
    paperBtnLabel: string;
  },
  {
    onToggleDesc: () => void;
    onChapterTap: (e: WechatMiniprogram.BaseEvent) => void;
    onStartRead: () => void;
    onStartGenerate: () => void;
    onToggleFavorite: () => Promise<void>;
    onRetry: () => void;
    fetch: () => Promise<void>;
    refreshActionLabels: () => void;
    onJumpPhotoSet: () => void;
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
    favBusy: false,
    coverToneClass: '',
    readableChapterCount: 0,
    importStatusLabel: '',
    actionsDisabled: false,
    readBtnLabel: '在线阅读',
    paperBtnLabel: '整本书出题',
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
    if (!this.data.book) return { title: '考题魔盒', path: '/pages/home/index' };
    return {
      title: `《${this.data.book.title}》 - 考题魔盒`,
      path: `/pages/book-detail/index?bookId=${encodeURIComponent(this.data.bookId)}&from=share`,
    };
  },

  async fetch() {
    this.setData({ loading: true, errorMsg: '' });
    try {
      const res = await bookService.detail(this.data.bookId);
      const readableChapterCount = res.chapters.filter((c) => c.has_content).length;
      const status: BookImportStatus = res.book.import_status ?? 'ready';
      const importStatusLabel = IMPORT_STATUS_LABEL[status] ?? '';
      const actionsDisabled = status !== 'ready';
      this.setData({
        book: res.book,
        chapters: res.chapters,
        coverToneClass: coverToneClass(res.book.title),
        loading: false,
        readableChapterCount,
        importStatusLabel,
        actionsDisabled,
      });
      this.refreshActionLabels();
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : '加载失败';
      this.setData({ loading: false, errorMsg: msg });
    }
  },

  refreshActionLabels() {
    const { selectedCount, chapters, readableChapterCount } = this.data;
    const readBtnLabel =
      selectedCount > 0
        ? `阅读选中(${selectedCount})`
        : chapters.length > 0
          ? readableChapterCount > 0
            ? '在线阅读'
            : '在线阅读(暂无正文)'
          : '在线阅读';
    const paperBtnLabel =
      selectedCount > 0 ? `按选中章节出题(${selectedCount})` : '整本书出题';
    this.setData({ readBtnLabel, paperBtnLabel });
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
    this.refreshActionLabels();
  },

  onStartRead() {
    if (this.data.actionsDisabled) {
      const tip =
        this.data.importStatusLabel ||
        (this.data.book?.import_status === 'failed' ? 'AI 整理失败' : 'AI 还在整理,稍等一下');
      toast(tip, 'none');
      return;
    }
    if (this.data.chapters.length === 0) {
      toast('暂无章节,无法阅读', 'none');
      return;
    }

    // 优先用第一个被选中的章节;否则交给阅读页选第一章
    const selectedIds = Object.keys(this.data.selectedChapterIds);
    let chapterId = '';
    if (selectedIds.length > 0) {
      const firstSelected = this.data.chapters.find((c) => this.data.selectedChapterIds[c.id]);
      chapterId = firstSelected?.id ?? '';
    }

    track('book_start_read', {
      book_id: this.data.bookId,
      chapter_id: chapterId || undefined,
      readable_count: this.data.readableChapterCount,
    });

    const url = chapterId
      ? `/pages/book-reader/index?bookId=${encodeURIComponent(this.data.bookId)}&chapterId=${encodeURIComponent(chapterId)}`
      : `/pages/book-reader/index?bookId=${encodeURIComponent(this.data.bookId)}`;
    wx.navigateTo({ url });
  },

  onStartGenerate() {
    if (this.data.actionsDisabled) {
      const tip =
        this.data.importStatusLabel ||
        (this.data.book?.import_status === 'failed' ? 'AI 整理失败,无法出题' : 'AI 还在整理,稍等一下');
      toast(tip, 'none');
      return;
    }

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

  /**
   * M8 PR2.6: 跳到双写的拍照集做"逐页校对"
   * - 仅当 book.linked_photo_set_id 存在时可点
   * - 点了直接跳 photo-review (走 OCR 流程, 用户可校对每一页)
   */
  onJumpPhotoSet() {
    const setId = this.data.book?.linked_photo_set_id;
    if (!setId) {
      toast('暂无可校对的拍照集', 'none');
      return;
    }
    track('book_jump_photo_set', { book_id: this.data.bookId, set_id: setId });
    wx.navigateTo({
      url: `/pages/photo-review/index?setId=${encodeURIComponent(setId)}`,
    });
  },

  async onToggleFavorite() {
    if (!this.data.book || this.data.favBusy) return;
    const next = !this.data.book.is_favorited;
    this.setData({ favBusy: true });
    try {
      if (next) {
        await favoriteService.add(this.data.bookId);
        track('book_favorite', { id: this.data.bookId });
        toast('已收藏');
      } else {
        await favoriteService.remove(this.data.bookId);
        track('book_unfavorite', { id: this.data.bookId });
        toast('已取消收藏');
      }
      this.setData({
        book: { ...this.data.book, is_favorited: next },
      });
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : '操作失败';
      toast(msg, 'error');
    } finally {
      this.setData({ favBusy: false });
    }
  },
});
