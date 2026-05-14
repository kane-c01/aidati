/**
 * U03 首页(书库 Tab)
 *
 * 视觉:Quietly Smart
 *  - 顶部问候 + 配额 / 登录 CTA
 *  - 搜索
 *  - 推荐:横滚书名卡(is_recommended=1)
 *  - 全部:纵向列表 + 分页(无关键词时也分页, 加载更多)
 *  - 有关键词时:纵向列表 + 分页(全库搜)
 *
 * 2026-05-07 起小程序定位为「考证学习」, 已下线书籍分类(分类管理 + 分类分区),
 * 改用「推荐 + 标签 + 全文搜索」覆盖找书路径。
 */

import { createStoreBindings } from 'mobx-miniprogram-bindings';

import { bookService, favoriteService, HttpError } from '../../services/index';
import { coverToneIndex } from '../../utils/cover';
import { toast } from '../../utils/toast';
import { track } from '../../utils/tracker';
import { userStore } from '../../stores/user';
import type { Book } from '../../types/domain';

interface BookView extends Book {
  _tone: number;
}

const PAGE_SIZE = 20;

interface PageData {
  keyword: string;
  /** 首页推荐区(顶部横滚) */
  recommendedBooks: BookView[];
  /** 全部书籍(纵向) - 同时承载首页与搜索结果 */
  allBooks: BookView[];
  page: number;
  hasMore: boolean;

  loading: boolean;
  /** 首页多请求并行时的首屏骨架 */
  homeLoading: boolean;

  greetingPrefix: string;
  quotaPercent: number;
  quotaRemain: number;
  mistakeBadge: number;
  avatarLetter: string;

  favBusySet: Record<string, boolean>;
}

interface PageMethods {
  onKeywordInput: (e: WechatMiniprogram.Input) => void;
  onClearKeyword: () => void;
  onSearch: () => void;
  onBookTap: (e: WechatMiniprogram.CustomEvent<{ id: string; book: Book }>) => void;
  onRecBookTap: (e: WechatMiniprogram.BaseEvent) => void;
  onFavoriteTap: (
    e: WechatMiniprogram.CustomEvent<{ id: string; book: Book; currentFavorited: boolean }>,
  ) => Promise<void>;
  onLoginCta: () => void;
  onAvatarTap: () => void;
  onQuickPhoto: () => void;
  onQuickMistake: () => void;
  onQuickBookList: () => void;
  onEmptyAction: () => void;
  fetchFirst: () => Promise<void>;
  fetchNext: () => Promise<void>;
  loadPage: () => Promise<void>;
  applyFavoriteToLists: (id: string, isFavorited: boolean) => void;
  recomputeUI: () => void;
  storeBindings: { destroyStoreBindings: () => void } | null;
  searchTimer: ReturnType<typeof setTimeout> | null;
}

function computeGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '凌晨好,';
  if (h < 11) return '早上好,';
  if (h < 13) return '午安,';
  if (h < 18) return '下午好,';
  if (h < 23) return '晚上好,';
  return '夜深了,';
}

function toBookView(b: Book): BookView {
  return { ...b, _tone: coverToneIndex(b.title) };
}

Page<PageData, PageMethods>({
  storeBindings: null,
  searchTimer: null,
  data: {
    keyword: '',
    recommendedBooks: [],
    allBooks: [],
    page: 1,
    hasMore: true,

    loading: false,
    homeLoading: false,

    greetingPrefix: '你好,',
    quotaPercent: 0,
    quotaRemain: 0,
    mistakeBadge: 0,
    avatarLetter: '我',

    favBusySet: {},
  },

  onLoad() {
    this.storeBindings = createStoreBindings(this, {
      namespace: 'userStore',
      store: userStore,
      fields: ['isLoggedIn', 'user', 'quota', 'stats'],
      actions: [],
    });
    this.setData({ greetingPrefix: computeGreeting() });
    this.recomputeUI();
    void this.fetchFirst();
  },

  onShow() {
    if (typeof wx.hideHomeButton === 'function') {
      wx.hideHomeButton({ fail: () => undefined });
    }
    if (userStore.isLoggedIn) {
      void userStore.refreshMe().then(() => this.recomputeUI());
    }
    this.setData({ greetingPrefix: computeGreeting() });
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

  recomputeUI() {
    const quota = userStore.quota;
    const quotaPercent =
      quota && quota.limit > 0
        ? Math.min(100, Math.max(0, Math.round((quota.used_quota / quota.limit) * 100)))
        : 0;
    const quotaRemain = quota ? Math.max(0, quota.limit - quota.used_quota) : 0;
    const mistakeBadge = userStore.stats?.active_mistakes ?? 0;
    const nickname = userStore.user?.nickname ?? '';
    const avatarLetter = nickname ? nickname.slice(0, 1).toUpperCase() : '我';
    this.setData({ quotaPercent, quotaRemain, mistakeBadge, avatarLetter });
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

  onBookTap(e) {
    const id = e.detail.id;
    track('home_book_click', { id });
    wx.navigateTo({ url: `/pages/book-detail/index?bookId=${encodeURIComponent(id)}` });
  },

  onRecBookTap(e) {
    const id = (e.currentTarget.dataset.id as string) || '';
    if (!id) return;
    track('home_rec_click', { id });
    wx.navigateTo({ url: `/pages/book-detail/index?bookId=${encodeURIComponent(id)}` });
  },

  async onFavoriteTap(e) {
    if (!userStore.isLoggedIn) {
      wx.reLaunch({ url: '/pages/login/index' });
      return;
    }
    const { id, currentFavorited } = e.detail;
    if (!id) return;
    if (this.data.favBusySet[id]) return;

    const next = !currentFavorited;
    this.setData({ favBusySet: { ...this.data.favBusySet, [id]: true } });

    try {
      if (next) await favoriteService.add(id);
      else await favoriteService.remove(id);
      track(next ? 'home_favorite_add' : 'home_favorite_remove', { id });
      this.applyFavoriteToLists(id, next);
      toast(next ? '已收藏' : '已取消收藏');
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : '操作失败';
      toast(msg, 'error');
    } finally {
      const nextSet = { ...this.data.favBusySet };
      delete nextSet[id];
      this.setData({ favBusySet: nextSet });
    }
  },

  applyFavoriteToLists(id: string, isFavorited: boolean) {
    const mapBook = (b: BookView): BookView =>
      b.id === id ? { ...b, is_favorited: isFavorited } : b;
    this.setData({
      recommendedBooks: this.data.recommendedBooks.map(mapBook),
      allBooks: this.data.allBooks.map(mapBook),
    });
  },

  onLoginCta() {
    wx.reLaunch({ url: '/pages/login/index' });
  },

  onAvatarTap() {
    if (userStore.isLoggedIn) {
      wx.reLaunch({ url: '/pages/profile/index' });
    } else {
      wx.reLaunch({ url: '/pages/login/index' });
    }
  },

  onQuickPhoto() {
    track('home_quick_photo');
    wx.reLaunch({ url: '/pages/photo/index' });
  },

  onQuickMistake() {
    track('home_quick_mistake');
    if (!userStore.isLoggedIn) {
      wx.reLaunch({ url: '/pages/login/index' });
      return;
    }
    wx.navigateTo({ url: '/pages/mistake/index' });
  },

  onQuickBookList() {
    wx.pageScrollTo({ scrollTop: 720, duration: 300 });
  },

  onEmptyAction() {
    if (this.data.keyword.trim()) {
      this.onClearKeyword();
    } else {
      wx.reLaunch({ url: '/pages/photo/index' });
    }
  },

  async fetchFirst() {
    const isSearching = !!this.data.keyword.trim();
    this.setData({
      page: 1,
      allBooks: [],
      hasMore: true,
      loading: !isSearching ? false : true,
      homeLoading: !isSearching,
      recommendedBooks: isSearching ? [] : this.data.recommendedBooks,
    });
    await this.loadPage();
  },

  async fetchNext() {
    if (!this.data.hasMore || this.data.loading) return;
    this.setData({ page: this.data.page + 1, loading: true });
    await this.loadPage();
  },

  async loadPage() {
    try {
      const kw = this.data.keyword.trim();
      const res = await bookService.list({
        keyword: kw || undefined,
        page: this.data.page,
        page_size: PAGE_SIZE,
        sort: 'recommended',
      });
      const list = (res.list ?? []).map(toBookView);
      const merged = this.data.page === 1 ? list : [...this.data.allBooks, ...list];

      const patch: Partial<PageData> = {
        allBooks: merged,
        hasMore: merged.length < (res.pagination?.total ?? merged.length),
      };
      if (!kw && this.data.page === 1) {
        patch.recommendedBooks = list.filter((b) => b.is_recommended);
      }
      this.setData(patch);
    } catch (err) {
      if (err instanceof HttpError) {
        toast(err.message || '加载失败', 'error');
      } else {
        toast('网络似乎不太顺畅', 'error');
      }
      this.setData({ hasMore: false });
    } finally {
      this.setData({ loading: false, homeLoading: false });
    }
  },
});
