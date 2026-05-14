/**
 * 我的收藏列表页
 *
 * - 3 列封面网格, 长按弹「取消收藏」
 * - 点击封面进入 book-detail
 * - 下拉刷新 / 触底加载
 */

import { favoriteService, HttpError } from '../../services/index';
import { coverToneIndex } from '../../utils/cover';
import { confirm, toast } from '../../utils/toast';
import { track } from '../../utils/tracker';
import type { FavoriteItem } from '../../types/api';

const PAGE_SIZE = 30;

interface FavoriteItemView extends FavoriteItem {
  _tone: number;
}

interface PageData {
  items: FavoriteItemView[];
  page: number;
  total: number;
  loading: boolean;
  hasMore: boolean;
}

interface PageMethods {
  onBookTap: (e: WechatMiniprogram.BaseEvent) => void;
  onLongPress: (e: WechatMiniprogram.BaseEvent) => void;
  onGotoBooks: () => void;
  fetchFirst: () => Promise<void>;
  fetchNext: () => Promise<void>;
  loadPage: () => Promise<void>;
}

Page<PageData, PageMethods>({
  data: {
    items: [],
    page: 1,
    total: 0,
    loading: false,
    hasMore: true,
  },

  onLoad() {
    void this.fetchFirst();
  },

  onShow() {
    if (typeof wx.hideHomeButton === 'function') {
      wx.hideHomeButton({ fail: () => undefined });
    }
  },

  onPullDownRefresh() {
    void this.fetchFirst().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    void this.fetchNext();
  },

  async fetchFirst() {
    this.setData({ page: 1, items: [], hasMore: true, loading: true });
    await this.loadPage();
  },

  async fetchNext() {
    if (!this.data.hasMore || this.data.loading) return;
    this.setData({ page: this.data.page + 1, loading: true });
    await this.loadPage();
  },

  async loadPage() {
    try {
      const res = await favoriteService.list({
        page: this.data.page,
        page_size: PAGE_SIZE,
      });
      const list: FavoriteItemView[] = res.list.map((it) => ({
        ...it,
        _tone: coverToneIndex(it.title),
      }));
      const merged = this.data.page === 1 ? list : [...this.data.items, ...list];
      this.setData({
        items: merged,
        total: res.pagination.total,
        hasMore: merged.length < res.pagination.total,
      });
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : '加载失败';
      toast(msg, 'error');
      this.setData({ hasMore: false });
    } finally {
      this.setData({ loading: false });
    }
  },

  onBookTap(e) {
    const id = (e.currentTarget.dataset.id as string) || '';
    if (!id) return;
    track('favorite_book_click', { id });
    wx.navigateTo({ url: `/pages/book-detail/index?bookId=${encodeURIComponent(id)}` });
  },

  onLongPress(e) {
    const id = (e.currentTarget.dataset.id as string) || '';
    if (!id) return;
    void confirm({
      title: '取消收藏',
      content: '从收藏中移除这本书?',
      confirmText: '取消收藏',
      cancelText: '保留',
    }).then(async (ok) => {
      if (!ok) return;
      try {
        await favoriteService.remove(id);
        track('favorite_remove', { id });
        const items = this.data.items.filter((it) => it.book_id !== id);
        this.setData({ items, total: Math.max(0, this.data.total - 1) });
        toast('已取消');
      } catch (err) {
        const msg = err instanceof HttpError ? err.message : '操作失败';
        toast(msg, 'error');
      }
    });
  },

  onGotoBooks() {
    wx.reLaunch({ url: '/pages/home/index' });
  },
});
