/**
 * 历史试卷列表
 *
 * 数据流:
 *  - 默认 status=all, 倒序展示用户所有 ready/submitted/graded 的试卷
 *  - 上方 segmented 切 全部 / 已批改 / 批改中 / 待提交
 *  - 下拉刷新, 触底加载更多
 *
 * 视觉:
 *  - 单条 row 卡, 顶部状态 chip + 来源 + 日期; 中间标题 + 副标; 底部 4 列指标(得分 / 正确率 / 题数 / 用时)
 */

import { paperService, HttpError } from '../../services/index';
import { toast } from '../../utils/toast';
import { track } from '../../utils/tracker';
import type {
  PaperHistoryItem,
  PaperHistoryStatus,
} from '../../types/api';

const PAGE_SIZE = 20;

interface FilterOption {
  label: string;
  value: PaperHistoryStatus;
}

const FILTER_OPTIONS: FilterOption[] = [
  { label: '全部', value: 'all' },
  { label: '已批改', value: 'graded' },
  { label: '批改中', value: 'submitted' },
  { label: '待答题', value: 'ready' },
];

const STATUS_LABEL_MAP: Record<string, string> = {
  ready: '待答题',
  submitted: '批改中',
  graded: '已完成',
  generating: '生成中',
  failed: '已失败',
};

const STATUS_TONE_MAP: Record<string, string> = {
  ready: 'tone-info',
  submitted: 'tone-warn',
  graded: 'tone-success',
  generating: 'tone-muted',
  failed: 'tone-muted',
};

interface DerivedItem extends PaperHistoryItem {
  title: string;
  subtitle: string | null;
  sourceLabel: string;
  dateLabel: string;
  timeLabel: string;

  scoreNum: number;
  scoreMax: number;
  accuracyMain: string;
  accuracyUnit: string;
}

interface BookOption {
  id: string;
  title: string;
}

interface ChapterOption {
  id: string;
  title: string;
}

interface PageData {
  filterOptions: FilterOption[];
  statusFilter: PaperHistoryStatus;
  bookFilter: string;
  bookFilterTitle: string;
  chapterFilter: string;
  chapterFilterTitle: string;

  items: DerivedItem[];
  total: number;
  page: number;
  loading: boolean;
  hasMore: boolean;

  bookOptions: BookOption[];
  /** 章节按 book_id 分组缓存 */
  chapterOptionsMap: Record<string, ChapterOption[]>;
  currentChapterOptions: ChapterOption[];

  bookChipText: string;
  chapterChipText: string;

  statusLabelMap: Record<string, string>;
  statusToneMap: Record<string, string>;
}

interface PageMethods {
  onFilterChange: (e: WechatMiniprogram.CustomEvent<{ value: PaperHistoryStatus }>) => void;
  onPickBook: () => void;
  onPickChapter: () => void;
  onClearFilters: () => void;
  onPaperTap: (e: WechatMiniprogram.BaseEvent) => void;
  onGotoPhoto: () => void;
  fetchFirst: () => Promise<void>;
  fetchNext: () => Promise<void>;
  loadPage: () => Promise<void>;
  ensureFilterOptions: () => Promise<void>;
  mergeFilterOptions: (rawList: PaperHistoryItem[]) => void;
  refreshChipTexts: () => void;
  decorate: (raw: PaperHistoryItem) => DerivedItem;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  if (sameYear) return `${m}-${day}`;
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatTimeSpent(sec: number | null): string {
  if (!sec || sec <= 0) return '';
  if (sec < 60) return `${sec}秒`;
  const mins = Math.round(sec / 60);
  if (mins < 60) return `${mins}分`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}小时` : `${h}小时${m}分`;
}

function buildSourceLabel(item: PaperHistoryItem): string {
  switch (item.source_type) {
    case 'book':
      return '书库出题';
    case 'chapter':
      return '章节出题';
    case 'photo_set':
      return '拍照出题';
    default:
      return '出题';
  }
}

function buildTitle(item: PaperHistoryItem): string {
  if (item.book_title) return item.book_title;
  if (item.photo_set_name) return item.photo_set_name;
  if (item.source_type === 'photo_set') return '拍照出题';
  return '本次出题';
}

function buildSubtitle(item: PaperHistoryItem): string | null {
  const parts: string[] = [];
  if (item.chapter_title) parts.push(item.chapter_title);
  if (parts.length === 0) return null;
  return parts.join(' · ');
}

Page<PageData, PageMethods>({
  data: {
    filterOptions: FILTER_OPTIONS,
    statusFilter: 'all',
    bookFilter: '',
    bookFilterTitle: '',
    chapterFilter: '',
    chapterFilterTitle: '',

    items: [],
    total: 0,
    page: 1,
    loading: false,
    hasMore: true,

    bookOptions: [],
    chapterOptionsMap: {},
    currentChapterOptions: [],

    bookChipText: '所有书籍',
    chapterChipText: '所有章节',

    statusLabelMap: STATUS_LABEL_MAP,
    statusToneMap: STATUS_TONE_MAP,
  },

  onLoad() {
    void this.ensureFilterOptions();
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

  decorate(raw) {
    const isGraded = raw.status === 'graded';
    const score = raw.total_score ?? 0;
    const max = raw.max_score ?? 0;

    const accuracyPercent = isGraded && max > 0 ? Math.round((score / max) * 100) : 0;
    const accuracyMain = isGraded ? String(accuracyPercent) : '—';
    const accuracyUnit = isGraded ? '%' : '';

    return {
      ...raw,
      title: buildTitle(raw),
      subtitle: buildSubtitle(raw),
      sourceLabel: buildSourceLabel(raw),
      dateLabel: formatDate(raw.created_at),
      timeLabel: formatTimeSpent(raw.time_spent_sec),
      scoreNum: score,
      scoreMax: max,
      accuracyMain,
      accuracyUnit,
    };
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
      const res = await paperService.list({
        status: this.data.statusFilter === 'all' ? undefined : this.data.statusFilter,
        book_id: this.data.bookFilter || undefined,
        chapter_id: this.data.chapterFilter || undefined,
        page: this.data.page,
        page_size: PAGE_SIZE,
      });
      const decorated = res.list.map((it) => this.decorate(it));
      const merged = this.data.page === 1 ? decorated : [...this.data.items, ...decorated];
      this.mergeFilterOptions(res.list);
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

  async ensureFilterOptions() {
    // 用一次"全状态、无 book/chapter 限制"的拉取作为 chip 候选池, 给 100 条上限避免大用户压力
    try {
      const res = await paperService.list({
        page: 1,
        page_size: 100,
      });
      this.mergeFilterOptions(res.list);
    } catch {
      // 失败不阻断, 后续每次 loadPage 也会顺手 merge
    }
  },

  mergeFilterOptions(rawList) {
    const bookMap = new Map<string, BookOption>();
    for (const opt of this.data.bookOptions) bookMap.set(opt.id, opt);

    const chapterMap: Record<string, Map<string, ChapterOption>> = {};
    for (const [bid, opts] of Object.entries(this.data.chapterOptionsMap)) {
      chapterMap[bid] = new Map(opts.map((c) => [c.id, c]));
    }

    for (const it of rawList) {
      if (it.book_id && it.book_title) {
        if (!bookMap.has(it.book_id)) {
          bookMap.set(it.book_id, { id: it.book_id, title: it.book_title });
        }
        if (it.chapter_id && it.chapter_title) {
          const m = chapterMap[it.book_id] ?? new Map<string, ChapterOption>();
          if (!m.has(it.chapter_id)) {
            m.set(it.chapter_id, { id: it.chapter_id, title: it.chapter_title });
          }
          chapterMap[it.book_id] = m;
        }
      }
    }

    const bookOptions = Array.from(bookMap.values()).sort((a, b) =>
      a.title.localeCompare(b.title, 'zh-Hans-CN'),
    );
    const chapterOptionsMap: Record<string, ChapterOption[]> = {};
    for (const [bid, m] of Object.entries(chapterMap)) {
      chapterOptionsMap[bid] = Array.from(m.values()).sort((a, b) =>
        a.title.localeCompare(b.title, 'zh-Hans-CN'),
      );
    }

    const currentChapterOptions = this.data.bookFilter
      ? chapterOptionsMap[this.data.bookFilter] ?? []
      : [];

    this.setData({ bookOptions, chapterOptionsMap, currentChapterOptions });
    this.refreshChipTexts();
  },

  refreshChipTexts() {
    const bookChipText = this.data.bookFilterTitle
      ? `《${this.data.bookFilterTitle}》`
      : '所有书籍';
    const chapterChipText = this.data.chapterFilterTitle || '所有章节';
    this.setData({ bookChipText, chapterChipText });
  },

  onFilterChange(e) {
    const next = e.detail.value;
    if (next === this.data.statusFilter) return;
    this.setData({ statusFilter: next });
    track('papers_status_filter', { status: next });
    void this.fetchFirst();
  },

  onPickBook() {
    const opts = this.data.bookOptions;
    const itemList = ['所有书籍', ...opts.map((o) => o.title)];
    wx.showActionSheet({
      itemList,
      success: (res) => {
        const idx = res.tapIndex;
        if (idx === 0) {
          this.setData({
            bookFilter: '',
            bookFilterTitle: '',
            chapterFilter: '',
            chapterFilterTitle: '',
            currentChapterOptions: [],
          });
        } else {
          const opt = opts[idx - 1];
          this.setData({
            bookFilter: opt.id,
            bookFilterTitle: opt.title,
            chapterFilter: '',
            chapterFilterTitle: '',
            currentChapterOptions: this.data.chapterOptionsMap[opt.id] ?? [],
          });
        }
        track('papers_book_filter', { book_id: this.data.bookFilter });
        this.refreshChipTexts();
        void this.fetchFirst();
      },
      fail: () => undefined,
    });
  },

  onPickChapter() {
    const opts = this.data.currentChapterOptions;
    if (opts.length === 0) return;
    const itemList = ['所有章节', ...opts.map((o) => o.title)];
    wx.showActionSheet({
      itemList,
      success: (res) => {
        const idx = res.tapIndex;
        if (idx === 0) {
          this.setData({ chapterFilter: '', chapterFilterTitle: '' });
        } else {
          const opt = opts[idx - 1];
          this.setData({ chapterFilter: opt.id, chapterFilterTitle: opt.title });
        }
        track('papers_chapter_filter', {
          book_id: this.data.bookFilter,
          chapter_id: this.data.chapterFilter,
        });
        this.refreshChipTexts();
        void this.fetchFirst();
      },
      fail: () => undefined,
    });
  },

  onClearFilters() {
    this.setData({
      bookFilter: '',
      bookFilterTitle: '',
      chapterFilter: '',
      chapterFilterTitle: '',
      currentChapterOptions: [],
    });
    this.refreshChipTexts();
    void this.fetchFirst();
  },

  onPaperTap(e) {
    const id = (e.currentTarget.dataset.id as string) || '';
    const status = (e.currentTarget.dataset.status as string) || '';
    if (!id) return;
    track('papers_open', { id, status });

    if (status === 'graded' || status === 'submitted') {
      wx.navigateTo({ url: `/pages/paper-result/index?paperId=${encodeURIComponent(id)}` });
      return;
    }
    if (status === 'ready') {
      wx.navigateTo({ url: `/pages/paper-answer/index?paperId=${encodeURIComponent(id)}` });
      return;
    }
    toast('该试卷不可查看', 'none');
  },

  onGotoPhoto() {
    wx.reLaunch({ url: '/pages/photo/index' });
  },
});
