/**
 * U07 出题配置页
 *
 * 输入: paperStore.pendingSource(由 book-detail 或 photo-review 设置)
 * 输出: 调 paperService.create → 跳 paper-loading
 *
 * 校验:
 *  - question_types 不能为空
 *  - count: 1-50, 自定义模式必填
 *  - 配额耗尽: 按钮 disabled, 文案变「今日额度已用尽」
 */

import { createStoreBindings } from 'mobx-miniprogram-bindings';

import {
  COUNT_PRESETS,
  COUNT_LIMIT,
  DIFFICULTY_LEVELS,
  DIFFICULTY_LABEL,
  QUESTION_TYPES,
  QUESTION_TYPE_LABEL,
} from '../../config/constants';
import { ContentBlockedError, HttpError, paperService, QuotaExceededError } from '../../services/index';
import { paperStore } from '../../stores/paper';
import { userStore } from '../../stores/user';
import { confirm, hideLoading, showLoading, toast } from '../../utils/toast';
import { track } from '../../utils/tracker';
import type {
  DifficultyLevel,
  GenerateConfig,
  PaperSourceType,
  QuestionType,
} from '../../types/domain';

interface ChipOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface PageData {
  config: GenerateConfig;
  typeOptions: ChipOption[];
  difficultyOptions: ChipOption[];
  countOptions: ChipOption[];
  countValueStr: string;
  customMode: boolean;
  sourceLabel: string;
  estimatedMinutes: number;
  canSubmit: boolean;
  submitting: boolean;
  exhaustHint: string;
}

interface PageMethods {
  onTypeChange: (e: WechatMiniprogram.CustomEvent<{ value: QuestionType[] }>) => void;
  onDifficultyChange: (e: WechatMiniprogram.CustomEvent<{ value: DifficultyLevel }>) => void;
  onCountChange: (e: WechatMiniprogram.CustomEvent<{ value: string[] }>) => void;
  onCustomCountInput: (e: WechatMiniprogram.Input) => void;
  onPromptInput: (e: WechatMiniprogram.Input) => void;
  onGenerate: () => Promise<void>;
  recompute: () => void;
  storeBindings: { destroyStoreBindings: () => void } | null;
}

Page<PageData, PageMethods>({
  storeBindings: null,
  data: {
    config: {
      question_types: ['single', 'judge'],
      difficulty: 'medium',
      count: 10,
      custom_prompt: '',
    },
    typeOptions: QUESTION_TYPES.map((t) => ({
      value: t,
      label: QUESTION_TYPE_LABEL[t],
      disabled: t === 'multiple',
    })),
    difficultyOptions: DIFFICULTY_LEVELS.map((d) => ({
      value: d,
      label: DIFFICULTY_LABEL[d],
    })),
    countOptions: [
      ...COUNT_PRESETS.map((n) => ({ value: String(n), label: `${n} 题` })),
      { value: 'custom', label: '自定义' },
    ],
    countValueStr: '10',
    customMode: false,
    sourceLabel: '',
    estimatedMinutes: 10,
    canSubmit: false,
    submitting: false,
    exhaustHint: '今日额度已用尽',
  },

  onLoad() {
    this.storeBindings = createStoreBindings(this, {
      namespace: 'userStore',
      store: userStore,
      fields: ['user', 'quota', 'isLoggedIn'],
      actions: [],
    });
    // 复用上次配置
    this.setData({ config: { ...paperStore.draftConfig } });

    // 描述出题来源
    const src = paperStore.pendingSource;
    let label = '未指定来源';
    if (src) {
      if (src.source_type === 'book') label = `整本书《${src.book_title ?? '?'}》`;
      else if (src.source_type === 'chapter')
        label = `《${src.book_title ?? '?'}》(已选 ${src.chapter_ids?.length ?? 0} 章)`;
      else if (src.source_type === 'photo_set') {
        const picked = src.selected_photo_ids?.length;
        label = picked && picked > 0 ? `本次拍照内容(已选 ${picked} 页)` : '本次拍照内容';
      }
    }
    this.setData({ sourceLabel: label });

    this.recompute();
  },

  onShow() {
    if (userStore.isLoggedIn) void userStore.refreshMe();
  },

  onUnload() {
    this.storeBindings?.destroyStoreBindings();
  },

  onTypeChange(e) {
    paperStore.setDraftConfig({ question_types: e.detail.value });
    this.setData({ config: { ...this.data.config, question_types: e.detail.value } });
    this.recompute();
  },

  onDifficultyChange(e) {
    paperStore.setDraftConfig({ difficulty: e.detail.value });
    this.setData({ config: { ...this.data.config, difficulty: e.detail.value } });
    this.recompute();
  },

  onCountChange(e) {
    const v = e.detail.value[0] ?? '10';
    if (v === 'custom') {
      this.setData({ countValueStr: 'custom', customMode: true });
      return;
    }
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) {
      paperStore.setDraftConfig({ count: n });
      this.setData({
        countValueStr: String(n),
        customMode: false,
        config: { ...this.data.config, count: n },
      });
      this.recompute();
    }
  },

  onCustomCountInput(e) {
    const n = parseInt(e.detail.value, 10);
    const safe = Number.isFinite(n) ? Math.max(1, Math.min(COUNT_LIMIT, n)) : 1;
    paperStore.setDraftConfig({ count: safe });
    this.setData({ config: { ...this.data.config, count: safe } });
    this.recompute();
  },

  onPromptInput(e) {
    paperStore.setDraftConfig({ custom_prompt: e.detail.value });
    this.setData({ config: { ...this.data.config, custom_prompt: e.detail.value } });
  },

  recompute() {
    const cfg = this.data.config;
    const validCount = cfg.count >= 1 && cfg.count <= COUNT_LIMIT;
    const validTypes = cfg.question_types.length > 0;
    const remaining = userStore.quota
      ? Math.max(0, userStore.quota.limit - userStore.quota.used_quota)
      : 1;
    const canSubmit = validCount && validTypes && remaining > 0;
    // 估算用时: 单选/判断 0.5 分钟, 多选/填空 1 分钟, 简答 2 分钟. MVP 简化按平均 0.8 分钟/题
    const minutes = Math.max(1, Math.round(cfg.count * 0.8));
    this.setData({
      canSubmit,
      estimatedMinutes: minutes,
      exhaustHint: remaining <= 0 ? '今日额度已用尽' : '请补全配置',
    });
  },

  async onGenerate() {
    if (this.data.submitting) return;
    if (!this.data.canSubmit) return;

    if (!userStore.isLoggedIn) {
      const ok = await confirm({
        title: '需要登录',
        content: '出题需要登录后才能使用,是否前往登录?',
        confirmText: '登录',
      });
      if (ok) wx.reLaunch({ url: '/pages/login/index' });
      return;
    }

    const src = paperStore.pendingSource;
    if (!src) {
      toast('未指定出题来源', 'error');
      return;
    }

    this.setData({ submitting: true });
    showLoading('提交中');
    try {
      const res = await paperService.create(
        {
          source_type: src.source_type as PaperSourceType,
          book_id: src.book_id,
          chapter_ids: src.chapter_ids,
          photo_set_id: src.photo_set_id,
          selected_photo_ids: src.selected_photo_ids,
          config: this.data.config,
        },
        userStore.user?.id,
      );
      hideLoading();
      this.setData({ submitting: false });
      paperStore.clearDraft();
      track('paper_create', { source_type: src.source_type, count: this.data.config.count });
      wx.redirectTo({
        url: `/pages/paper-loading/index?paperId=${encodeURIComponent(res.paper_id)}`,
      });
    } catch (err) {
      hideLoading();
      this.setData({ submitting: false });
      if (err instanceof QuotaExceededError) {
        await confirm({
          title: '今日额度已用尽',
          content: '明日 0 点重置,要不先看看错题本?',
          showCancel: true,
          cancelText: '我知道了',
          confirmText: '看错题',
        }).then((ok) => {
          if (ok) wx.navigateTo({ url: '/pages/mistake/index' });
        });
        return;
      }
      if (err instanceof ContentBlockedError) {
        await confirm({
          title: '内容被拦截',
          content: err.message || '内容包含不适宜信息,无法继续',
          showCancel: false,
          confirmText: '我知道了',
        });
        return;
      }
      if (err instanceof HttpError) {
        toast(err.message || '出题失败', 'error');
      } else {
        toast('提交失败,请重试', 'error');
      }
    }
  },
});
