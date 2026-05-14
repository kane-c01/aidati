/**
 * U12 我的(Tab 3)
 *
 * 视觉:克制留白, 中轴对齐, 单色调
 *  - 顶栏:仅"我的" + 设置按钮
 *  - 中轴头像 + 昵称 + Lv chip
 *  - 单条克制升级进度
 *  - 2x2 数据(无装饰, 仅 label + 大字)
 *  - 学习 / 通用 双分组列表
 *
 * 等级表纯前端派生,基于累计答题数
 */

import { createStoreBindings } from 'mobx-miniprogram-bindings';

import { favoriteService } from '../../services/index';
import { userStore } from '../../stores/user';
import { track } from '../../utils/tracker';

interface LevelDef {
  level: number;
  title: string;
  threshold: number;
}

const LEVEL_TABLE: readonly LevelDef[] = [
  { level: 1, title: '初学者', threshold: 0 },
  { level: 2, title: '入门', threshold: 10 },
  { level: 3, title: '进阶', threshold: 50 },
  { level: 4, title: '熟练', threshold: 150 },
  { level: 5, title: '高手', threshold: 400 },
  { level: 6, title: '大师', threshold: 1000 },
  { level: 7, title: '宗师', threshold: 3000 },
];

interface LevelInfo {
  num: number;
  title: string;
  hint: string;
  progress: string;
  percent: number;
}

function computeLevel(totalQuestions: number): LevelInfo {
  let curIdx = 0;
  for (let i = 0; i < LEVEL_TABLE.length; i += 1) {
    if (totalQuestions >= LEVEL_TABLE[i].threshold) {
      curIdx = i;
    } else {
      break;
    }
  }
  const cur = LEVEL_TABLE[curIdx];
  const next = LEVEL_TABLE[curIdx + 1];
  if (!next) {
    return {
      num: cur.level,
      title: cur.title,
      hint: '已经是顶级宗师了, 继续保持',
      progress: '已满',
      percent: 100,
    };
  }
  const span = next.threshold - cur.threshold;
  const done = totalQuestions - cur.threshold;
  const percent = span > 0 ? Math.max(2, Math.min(100, Math.round((done / span) * 100))) : 100;
  return {
    num: cur.level,
    title: cur.title,
    hint: `距 Lv.${next.level} ${next.title} 还差 ${next.threshold - totalQuestions} 题`,
    progress: `${done} / ${span}`,
    percent,
  };
}

interface PageData {
  avatarInitial: string;
  appVersion: string;

  levelNum: number;
  levelTitle: string;
  levelHint: string;
  levelProgressLabel: string;
  levelPercent: number;

  accuracyMain: string;
  accuracyUnit: string;

  favoriteCount: number;
}

interface PageMethods {
  onSettings: () => void;
  onMistake: () => void;
  onPapers: () => void;
  onFavorites: () => void;
  onLibrary: () => void;
  onFeedback: () => void;
  onAbout: () => void;
  onLogin: () => void;
  recompute: () => void;
  refreshFavoriteCount: () => Promise<void>;
  storeBindings: { destroyStoreBindings: () => void } | null;
}

Page<PageData, PageMethods>({
  data: {
    avatarInitial: '我',
    appVersion: '1.0.0',

    levelNum: 1,
    levelTitle: '初学者',
    levelHint: '答完 10 题升至 Lv.2 入门',
    levelProgressLabel: '0 / 10',
    levelPercent: 2,

    accuracyMain: '—',
    accuracyUnit: '',

    favoriteCount: 0,
  },
  storeBindings: null,

  onLoad() {
    this.storeBindings = createStoreBindings(this, {
      namespace: 'userStore',
      store: userStore,
      fields: ['user', 'stats', 'isLoggedIn'],
      actions: [],
    });
    this.recompute();
  },

  onShow() {
    if (typeof wx.hideHomeButton === 'function') {
      wx.hideHomeButton({ fail: () => undefined });
    }
    if (userStore.isLoggedIn) {
      void userStore.refreshMe();
      void this.refreshFavoriteCount();
    }
    this.recompute();
  },

  onPullDownRefresh() {
    void userStore.refreshMe().finally(() => wx.stopPullDownRefresh());
  },

  onUnload() {
    this.storeBindings?.destroyStoreBindings();
  },

  recompute() {
    const stats = userStore.stats;
    const nickname = userStore.user?.nickname ?? '';
    const initial = nickname ? nickname.slice(0, 1).toUpperCase() : '我';

    const totalQ = stats?.total_questions ?? 0;
    const acc = stats?.accuracy_rate ?? 0;
    const lvl = computeLevel(totalQ);

    const accuracyPercent = stats ? Math.round(acc * 100) : 0;
    const accuracyMain = stats ? String(accuracyPercent) : '—';
    const accuracyUnit = stats ? '%' : '';

    this.setData({
      avatarInitial: initial,

      levelNum: lvl.num,
      levelTitle: lvl.title,
      levelHint: lvl.hint,
      levelProgressLabel: lvl.progress,
      levelPercent: lvl.percent,

      accuracyMain,
      accuracyUnit,
    });
  },

  async refreshFavoriteCount() {
    try {
      const res = await favoriteService.list({ page: 1, page_size: 1 });
      this.setData({ favoriteCount: res.pagination.total });
    } catch {
      // 不阻断, 只是徽标拿不到, 走 0
    }
  },
  onSettings() {
    track('profile_to_settings');
    wx.navigateTo({ url: '/pages/settings/index' });
  },
  onMistake() {
    track('profile_to_mistake');
    wx.navigateTo({ url: '/pages/mistake/index' });
  },
  onPapers() {
    track('profile_to_papers');
    wx.navigateTo({ url: '/pages/papers/index' });
  },
  onFavorites() {
    track('profile_to_favorites');
    wx.navigateTo({ url: '/pages/favorites/index' });
  },
  onLibrary() {
    track('profile_to_library');
    wx.navigateTo({ url: '/pages/library/index' });
  },
  onFeedback() {
    track('profile_to_feedback');
    wx.navigateTo({ url: '/pages/feedback/index' });
  },
  onAbout() {
    wx.showModal({
      title: '关于',
      content: '考题魔盒\n版本 1.0.0',
      showCancel: false,
      confirmText: '我知道了',
    });
  },
  onLogin() {
    wx.reLaunch({ url: '/pages/login/index' });
  },
});
