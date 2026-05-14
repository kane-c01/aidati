/**
 * 我的书库(M8)— 列出当前用户上传的 PDF 自建书
 *
 * PR2.4 变化:
 * - 后端改异步抽章后, 卡片要展示 import_status 进度
 * - 当列表里有 preparing/extracting/splitting 状态时, 每 5s 轮询一次, 全部 ready/failed 后停
 * - 出题 / 阅读按钮在非 ready 状态下置灰, 防止用户进入空内容页
 */

import { HttpError, bookService } from '../../services/index';
import type { MyBookListItem } from '../../services/book';
import type { BookImportStatus } from '../../types/domain';
import { paperStore } from '../../stores/paper';
import { coverToneIndex } from '../../utils/cover';
import { confirm, hideLoading, showLoading, toast } from '../../utils/toast';

interface CardView extends MyBookListItem {
  _tone: number;
  _isProcessing: boolean;
  _isFailed: boolean;
  _actionsDisabled: boolean;
  _statusLabel: string;
  _progress: number;
}

interface PageData {
  loading: boolean;
  books: CardView[];
  total: number;
  totalLabel: string;
}

interface PageMethods {
  load: () => Promise<void>;
  startPollingIfNeeded: () => void;
  stopPolling: () => void;
  onGoCapture: () => void;
  onOpenBook: (e: WechatMiniprogram.BaseEvent) => void;
  onRead: (e: WechatMiniprogram.BaseEvent) => void;
  onMakePaper: (e: WechatMiniprogram.BaseEvent) => void;
  onMore: (e: WechatMiniprogram.BaseEvent) => void;
  pollHandle: number;
}

const STATUS_LABELS: Record<BookImportStatus, string> = {
  preparing: 'AI 正在准备…',
  extracting: 'AI 正在抽取文字… 通常 1-3 分钟',
  splitting: 'AI 正在切分章节…',
  ready: '已就绪',
  failed: '失败',
};

function decorate(b: MyBookListItem): CardView {
  const status: BookImportStatus = (b.import_status as BookImportStatus | undefined) ?? 'ready';
  const isProcessing =
    status === 'preparing' || status === 'extracting' || status === 'splitting';
  const isFailed = status === 'failed';
  return {
    ...b,
    _tone: coverToneIndex(b.title),
    _isProcessing: isProcessing,
    _isFailed: isFailed,
    _actionsDisabled: isProcessing || isFailed || (b.chapters_count ?? 0) === 0,
    _statusLabel: STATUS_LABELS[status] ?? '处理中',
    _progress: typeof b.import_progress === 'number' ? Math.max(5, Math.min(95, b.import_progress)) : 5,
  };
}

Page<PageData, PageMethods>({
  data: {
    loading: false,
    books: [],
    total: 0,
    totalLabel: '',
  },
  pollHandle: 0,

  onLoad() {
    void this.load();
  },

  onShow() {
    void this.load();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true });
    try {
      const res = await bookService.listMine(1, 50);
      const list: CardView[] = res.list.map(decorate);
      this.setData({
        loading: false,
        books: list,
        total: res.pagination.total,
        totalLabel: res.pagination.total > 0 ? `共 ${res.pagination.total} 本` : '空书库',
      });
      this.startPollingIfNeeded();
    } catch (err) {
      this.setData({ loading: false });
      if (err instanceof HttpError) toast(err.message, 'error');
      else toast('加载失败', 'error');
    }
  },

  startPollingIfNeeded() {
    const hasProcessing = this.data.books.some((b) => b._isProcessing);
    if (hasProcessing) {
      if (this.pollHandle) return;
      this.pollHandle = setTimeout(() => {
        this.pollHandle = 0;
        void this.load();
      }, 5000) as unknown as number;
    } else {
      this.stopPolling();
    }
  },

  stopPolling() {
    if (this.pollHandle) {
      clearTimeout(this.pollHandle);
      this.pollHandle = 0;
    }
  },

  /**
   * M8 PR2.6:跳到拍照 tab(替代原"上传 PDF 自建书"按钮)
   * 拍照页有「从文件导入」入口可选 PDF / 微信聊天图片;
   * 校对完成后用户可在 photo-review 页点「保存为书」入库。
   */
  onGoCapture() {
    wx.switchTab({ url: '/pages/photo/index' });
  },

  onOpenBook(e) {
    const id = (e.currentTarget.dataset as { id?: string }).id ?? '';
    if (!id) return;
    const target = this.data.books.find((b) => b.id === id);
    if (target?._actionsDisabled) {
      toast(target._isFailed ? '该书 AI 整理失败,请重试或删除' : 'AI 还在整理,稍等一下', 'none');
      return;
    }
    wx.navigateTo({
      url: `/pages/book-reader/index?bookId=${encodeURIComponent(id)}`,
    });
  },

  onRead(e) {
    this.onOpenBook(e);
  },

  onMakePaper(e) {
    const id = (e.currentTarget.dataset as { id?: string }).id ?? '';
    const target = this.data.books.find((b) => b.id === id);
    if (!target) return;
    if (target._actionsDisabled) {
      toast(target._isFailed ? 'AI 整理失败,无法出题' : 'AI 还在整理,稍等一下', 'none');
      return;
    }
    paperStore.setPendingSource({
      source_type: 'book',
      book_id: id,
      book_title: target.title,
    });
    wx.navigateTo({ url: '/pages/paper-config/index' });
  },

  onMore(e) {
    const id = (e.currentTarget.dataset as { id?: string }).id ?? '';
    const target = this.data.books.find((b) => b.id === id);
    if (!target) return;
    wx.showActionSheet({
      itemList: ['改名 / 换封面', '删除'],
      success: async (res) => {
        if (res.tapIndex === 0) {
          // book-upload 页支持 ?editId 走"仅编辑模式"(只改 title/author/cover/desc, 不重新上传 PDF)
          wx.navigateTo({
            url: `/pages/book-upload/index?editId=${encodeURIComponent(id)}`,
          });
        } else if (res.tapIndex === 1) {
          const ok = await confirm({
            title: '删除',
            content: `删除《${target.title}》?(同时清空章节, 已生成的试卷不受影响)`,
            confirmText: '删除',
          });
          if (!ok) return;
          showLoading('删除中');
          try {
            await bookService.deleteMine(id);
            hideLoading();
            toast('已删除', 'success');
            void this.load();
          } catch (err) {
            hideLoading();
            if (err instanceof HttpError) toast(err.message, 'error');
            else toast('删除失败', 'error');
          }
        }
      },
    });
  },
});
