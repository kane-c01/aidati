/**
 * U03 首页(书库 Tab)
 *
 * 数据流:
 *  - 默认 sort=recommended
 *  - 输入关键词 → debounce 300ms → 重新拉第一页
 *  - 分类 chip 切换 → 重新拉第一页
 *  - 上拉到底 → fetchNext
 *  - 下拉刷新 → fetchFirst
 *
 * 用 createStoreBindings 把 userStore 镜像到 setData 里, WXML 里能用 userStore.isLoggedIn
 */

import { createStoreBindings } from 'mobx-miniprogram-bindings';

import { bookService } from '../../services';
import { HttpError } from '../../services';
import { toast } from '../../utils/toast';
import { track } from '../../utils/tracker';
import { userStore } from '../../stores/user';
import type { Book } from '../../types/domain';

const PAGE_SIZE = 20;

interface CategoryOption {
  value: string;
  label: string;
}

const CATEGORIES: CategoryOption[] = [
  { value: 'all', label: '全部' },
  { value: '文学', label: '文学' },
  { value: '历史', label: '历史' },
  { value: '考试', label: '考试' },
  { value: '自学', label: '自学' },
  { value: '教材', label: '教材' },
];

interface PageData {
  keyword: string;
  selectedCategory: string;
  categoryOptions: CategoryOption[];
  books: Book[];
  recommendedBooks: Book[];
  page: number;
  loading: boolean;
  hasMore: boolean;
}

interface PageMethods {
  onKeywordInput: (e: WechatMiniprogram.Input) => void;
  onClearKeyword: () => void;
  onSearch: () => void;
  onCategoryChange: (e: WechatMiniprogram.CustomEvent<{ value: string[] }>) => void;
  onBookTap: (e: WechatMiniprogram.CustomEvent<{ id: string; book: Book }>) => void;
  onQuotaTap: () => void;
  fetchFirst: () => Promise<void>;
  fetchNext: () => Promise<void>;
  loadPage: () => Promise<void>;
  storeBindings: { destroyStoreBindings: () => void } | null;
  searchTimer: ReturnType<typeof setTimeout> | null;
}

Page<PageData, PageMethods>({
  storeBindings: null,
  searchTimer: null,
  data: {
    keyword: '',
    selectedCategory: 'all',
    categoryOptions: CATEGORIES,
    books: [],
    recommendedBooks: [],
    page: 1,
    loading: false,
    hasMore: true,
  },

  onLoad() {
    this.storeBindings = createStoreBindings(this, {
      namespace: 'userStore',
      store: userStore,
      fields: ['isLoggedIn', 'user', 'quota'],
      actions: [],
    });
    void this.fetchFirst();
  },

  onShow() {
    if (userStore.isLoggedIn) {
      void userStore.refreshMe();
    }
  },

  onUnload() {
    this.storeBindings?.destroyStoreBindings();
  },

  onPullDownRefresh() {
    void this.fetchFirst().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    void this.fetchNext();
  },

  onKeywordInput(e) {
    const v = e.detail.value;
    this.setData({ keyword: v });
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      void this.fetchFirst();
    }, 300);
  },

  onClearKeyword() {
    this.setData({ keyword: '' });
    void this.fetchFirst();
  },

  onSearch() {
    void this.fetchFirst();
  },

  onCategoryChange(e) {
    const next = e.detail.value[0] ?? 'all';
    if (next === this.data.selectedCategory) return;
    this.setData({ selectedCategory: next });
    track('home_category_change', { category: next });
    void this.fetchFirst();
  },

  onBookTap(e) {
    const id = e.detail.id;
    track('home_book_click', { id });
    wx.navigateTo({ url: `/pages/book-detail/index?bookId=${encodeURIComponent(id)}` });
  },

  onQuotaTap() {
    wx.showModal({
      title: '今日额度',
      content: '每日 0 点重置, 取消出题不扣;详细规则见用户协议。',
      showCancel: false,
      confirmText: '我知道了',
    });
  },

  async fetchFirst() {
    this.setData({ page: 1, loading: true, hasMore: true, books: [] });
    await this.loadPage();
  },

  async fetchNext() {
    if (!this.data.hasMore || this.data.loading) return;
    this.setData({ page: this.data.page + 1, loading: true });
    await this.loadPage();
  },

  async loadPage() {
    try {
      const res = await bookService.list({
        keyword: this.data.keyword || undefined,
        category:
          this.data.selectedCategory === 'all' ? undefined : this.data.selectedCategory,
        page: this.data.page,
        page_size: PAGE_SIZE,
        sort: 'recommended',
      });
      const list = res.list ?? [];
      const merged = this.data.page === 1 ? list : [...this.data.books, ...list];
      const recommended = merged.filter((b) => b.is_recommended);
      this.setData({
        books: merged,
        recommendedBooks: recommended,
        hasMore: merged.length < (res.pagination?.total ?? merged.length),
      });
    } catch (err) {
      if (err instanceof HttpError) {
        toast(err.message || '加载失败', 'error');
      } else {
        toast('网络似乎不太顺畅', 'error');
      }
      this.setData({ hasMore: false });
    } finally {
      this.setData({ loading: false });
    }
  },
});
