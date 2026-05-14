/**
 * U14 设置页
 */

import { createStoreBindings } from 'mobx-miniprogram-bindings';

import { authService, HttpError } from '../../services/index';
import { confirm, hideLoading, showLoading, toast } from '../../utils/toast';
import { env } from '../../config/env';
import { userStore } from '../../stores/user';

interface PageData {
  vibrate: boolean;
  version: string;
  cacheLabel: string;
}

interface PageMethods {
  onVibrateToggle: (e: WechatMiniprogram.SwitchChange) => void;
  onClearCache: () => Promise<void>;
  onOpenAgreement: (e: WechatMiniprogram.BaseEvent) => void;
  onLogout: () => Promise<void>;
  onCancelAccount: () => Promise<void>;
  refreshCache: () => void;
  storeBindings: { destroyStoreBindings: () => void } | null;
}

Page<PageData, PageMethods>({
  data: {
    vibrate: true,
    version: env.CLIENT_VERSION,
    cacheLabel: '0 KB',
  },
  storeBindings: null,

  onLoad() {
    this.storeBindings = createStoreBindings(this, {
      namespace: 'userStore',
      store: userStore,
      fields: ['isLoggedIn', 'user'],
      actions: [],
    });
    this.refreshCache();
  },

  onUnload() {
    this.storeBindings?.destroyStoreBindings();
  },

  refreshCache() {
    try {
      const info = wx.getStorageInfoSync();
      const kb = Math.max(0, Math.round(info.currentSize));
      const mb = (kb / 1024).toFixed(1);
      this.setData({
        cacheLabel: kb > 1024 ? `${mb} MB` : `${kb} KB`,
      });
    } catch {
      this.setData({ cacheLabel: '— KB' });
    }
  },

  onVibrateToggle(e) {
    this.setData({ vibrate: e.detail.value });
  },

  async onClearCache() {
    const ok = await confirm({
      title: '清除缓存?',
      content: '将清除本地草稿和临时数据, 不影响登录态',
      confirmText: '清除',
    });
    if (!ok) return;
    try {
      // 仅清非 auth 命名空间, 保留登录态
      const info = wx.getStorageInfoSync();
      info.keys
        .filter((k) => !k.startsWith('auth.'))
        .forEach((k) => wx.removeStorageSync(k));
      this.refreshCache();
      toast('已清除', 'success');
    } catch (err) {
      console.warn('[settings] clear cache failed', err);
      toast('清除失败', 'error');
    }
  },

  onOpenAgreement(e) {
    const key = e.currentTarget.dataset.key as string;
    const titleMap: Record<string, string> = {
      user: '用户协议',
      privacy: '隐私政策',
    };
    wx.showModal({
      title: titleMap[key] ?? '协议',
      content: '正式条款由律师提供; 本页面是 MVP 占位, 上线前用 web-view 打开备案后的真实页面。',
      showCancel: false,
      confirmText: '我知道了',
    });
  },

  async onLogout() {
    const ok = await confirm({ title: '退出登录?', content: '退出后需重新登录' });
    if (!ok) return;
    showLoading('退出中');
    try {
      await userStore.logout();
    } finally {
      hideLoading();
      wx.reLaunch({ url: '/pages/login/index' });
    }
  },

  async onCancelAccount() {
    const ok = await confirm({
      title: '注销账号?',
      content: '将进入 7 天冷静期, 期间登录则取消注销; 期满后所有学习数据将被删除',
      confirmText: '继续注销',
      cancelText: '我再想想',
      confirmColor: '#E14C4C',
    });
    if (!ok) return;
    showLoading('提交注销');
    try {
      const res = await authService.cancelAccount();
      hideLoading();
      await confirm({
        title: '注销已提交',
        content: `预计于 ${res.scheduled_delete_at} 后删除, 现在可以退出登录`,
        showCancel: false,
        confirmText: '我知道了',
      });
      await userStore.logout(true);
      wx.reLaunch({ url: '/pages/login/index' });
    } catch (err) {
      hideLoading();
      if (err instanceof HttpError) toast(err.message, 'error');
      else toast('提交失败', 'error');
    }
  },
});
