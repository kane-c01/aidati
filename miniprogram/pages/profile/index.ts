/**
 * U12 我的(Tab 3)
 */

import { createStoreBindings } from 'mobx-miniprogram-bindings';

import { userStore } from '../../stores/user';
import { track } from '../../utils/tracker';

const ROLE_LABEL: Record<string, string> = {
  user: '普通用户',
  admin: '管理员',
  super_admin: '超级管理员',
};

interface PageData {
  roleLabel: string;
  accuracyLabel: string;
}

interface PageMethods {
  onSettings: () => void;
  onMistake: () => void;
  onFeedback: () => void;
  onAbout: () => void;
  onLogin: () => void;
  recompute: () => void;
  storeBindings: { destroyStoreBindings: () => void } | null;
}

Page<PageData, PageMethods>({
  data: {
    roleLabel: '',
    accuracyLabel: '—',
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
    if (userStore.isLoggedIn) void userStore.refreshMe();
    this.recompute();
  },

  onPullDownRefresh() {
    void userStore.refreshMe().finally(() => wx.stopPullDownRefresh());
  },

  onUnload() {
    this.storeBindings?.destroyStoreBindings();
  },

  recompute() {
    const role = userStore.user?.role ?? 'user';
    const stats = userStore.stats;
    this.setData({
      roleLabel: ROLE_LABEL[role] ?? role,
      accuracyLabel: stats ? `${Math.round(stats.accuracy_rate * 100)}%` : '—',
    });
  },

  onSettings() {
    track('profile_to_settings');
    wx.navigateTo({ url: '/pages/settings/index' });
  },
  onMistake() {
    track('profile_to_mistake');
    wx.navigateTo({ url: '/pages/mistake/index' });
  },
  onFeedback() {
    track('profile_to_feedback');
    wx.navigateTo({ url: '/pages/feedback/index' });
  },
  onAbout() {
    wx.showModal({
      title: '关于',
      content: 'AI 智能出题学习\n版本 1.0.0\n备案号待补',
      showCancel: false,
      confirmText: '我知道了',
    });
  },
  onLogin() {
    wx.reLaunch({ url: '/pages/login/index' });
  },
});
