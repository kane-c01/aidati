/**
 * U13 错题本(列表)
 *
 * - 顶部 segmented 切换 active / mastered
 * - 上拉加载, 下拉刷新
 * - 点条目 → 详情(MVP 简化:展开 Modal 显示题干 + 正确答案 + AI 解析)
 * - 「重做错题」按当前筛选生成临时试卷, 跳到 paper-loading
 *
 * 注:由于 mistake 列表很多场景, 详情独立页性价比不高, 先合并展示;
 *     V2 单独抽 mistake-detail 页(支持「立即重做单题」)
 */

import { createStoreBindings } from 'mobx-miniprogram-bindings';

import { mistakeService, HttpError } from '../../services/index';
import { mistakeStore } from '../../stores/mistake';
import { confirm, hideLoading, showLoading, toast } from '../../utils/toast';
import { track } from '../../utils/tracker';
import type { MistakeItem, MistakeStatus, MistakeSummary } from '../../types/domain';

interface PageData {
  filterStatus: MistakeStatus;
  statusOptions: { label: string; value: MistakeStatus }[];
  list: MistakeItem[];
  summary: MistakeSummary;
  loading: boolean;
  hasMore: boolean;
}

interface PageMethods {
  onStatusChange: (e: WechatMiniprogram.CustomEvent<{ value: MistakeStatus }>) => void;
  onItemTap: (e: WechatMiniprogram.CustomEvent<{ id: string }>) => void;
  onGoHome: () => void;
  onPractice: () => Promise<void>;
  storeBindings: { destroyStoreBindings: () => void } | null;
}

Page<PageData, PageMethods>({
  storeBindings: null,
  data: {
    filterStatus: 'active',
    statusOptions: [
      { label: '待巩固', value: 'active' },
      { label: '已掌握', value: 'mastered' },
    ],
    list: [],
    summary: { active: 0, mastered: 0 },
    loading: false,
    hasMore: true,
  },

  onLoad() {
    this.storeBindings = createStoreBindings(this, {
      namespace: 'mistakeStore',
      store: mistakeStore,
      fields: ['list', 'summary', 'loading', 'hasMore', 'filterStatus'],
      actions: [],
    });
    void mistakeStore.fetchFirst();
  },

  onShow() {
    if (mistakeStore.list.length === 0) void mistakeStore.fetchFirst();
  },

  onUnload() {
    this.storeBindings?.destroyStoreBindings();
  },

  onPullDownRefresh() {
    void mistakeStore.fetchFirst().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    void mistakeStore.fetchNext();
  },

  onStatusChange(e) {
    const next = e.detail.value;
    if (next === mistakeStore.filterStatus) return;
    mistakeStore.setFilter({ filterStatus: next });
    void mistakeStore.fetchFirst();
  },

  async onItemTap(e) {
    const id = e.detail.id;
    const item = mistakeStore.list.find((m) => m.id === id);
    if (!item) return;
    const detail = `题型: ${item.question.type}\n题干: ${item.question.stem}\n\n错过 ${item.wrong_count} 次\n${item.consecutive_correct >= 1 ? `连续答对 ${item.consecutive_correct} 次` : ''}`;
    const ok = await confirm({
      title: '错题详情',
      content: detail,
      confirmText: item.status === 'active' ? '标记掌握' : '取消掌握',
      cancelText: '关闭',
    });
    if (!ok) return;
    try {
      if (item.status === 'active') {
        await mistakeService.master(id);
        mistakeStore.removeItem(id);
        toast('已标记掌握', 'success');
      } else {
        await mistakeService.unmaster(id);
        mistakeStore.removeItem(id);
        toast('已取消掌握', 'success');
      }
    } catch (err) {
      if (err instanceof HttpError) toast(err.message, 'error');
      else toast('操作失败', 'error');
    }
  },

  onGoHome() {
    wx.reLaunch({ url: '/pages/home/index' });
  },

  async onPractice() {
    if (this.data.summary.active <= 0) {
      toast('当前没有错题');
      return;
    }
    const ok = await confirm({
      title: '重做错题',
      content: `把全部 ${this.data.summary.active} 道待巩固错题组成一卷, 准备好了吗?`,
      confirmText: '开始',
    });
    if (!ok) return;
    showLoading('生成中...');
    try {
      const res = await mistakeService.practice({ mistake_ids: undefined });
      hideLoading();
      track('mistake_practice', { n: this.data.summary.active });
      wx.navigateTo({
        url: `/pages/paper-loading/index?paperId=${encodeURIComponent(res.paper_id)}`,
      });
    } catch (err) {
      hideLoading();
      if (err instanceof HttpError) toast(err.message, 'error');
      else toast('生成失败,请重试', 'error');
    }
  },
});
