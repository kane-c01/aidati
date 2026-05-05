/**
 * U01 登录页
 *
 * - 微信一键登录(wx.login → POST /v1/auth/wechat-login)
 * - 协议必须勾选才能点登录(disabled 灰显)
 * - dev 环境下 wx.login 失败时 fallback 用 mock-001 code(后端 M1 支持)
 * - 登录成功:首次登录 → onboarding;否则 → home
 */

import { ContentBlockedError, HttpError } from '../../services';
import { ERROR_CODES, STORAGE_KEYS } from '../../config/constants';
import { ENV_VERSION_LABEL, env } from '../../config/env';
import { confirm, hideLoading, showLoading, toast } from '../../utils/toast';
import { setStorage } from '../../utils/storage';
import { track } from '../../utils/tracker';
import { userStore } from '../../stores/user';
import type { WechatLoginRequest } from '../../types/api';

Page({
  data: {
    privacyAgreed: false,
    loading: false,
    version: env.CLIENT_VERSION,
    envLabel: ENV_VERSION_LABEL,
  },

  onLoad() {
    if (userStore.isLoggedIn) {
      wx.reLaunch({ url: '/pages/home/index' });
    }
  },

  onTogglePrivacy() {
    this.setData({ privacyAgreed: !this.data.privacyAgreed });
  },

  onOpenPrivacy(e: WechatMiniprogram.BaseEvent) {
    const key = e.currentTarget.dataset.key as string;
    track('login_open_privacy', { key });
    wx.showModal({
      title: key === 'user' ? '《用户协议》' : '《隐私政策》',
      content: '正式协议文本将在 settings 页打开,这里是占位说明。',
      showCancel: false,
      confirmText: '我知道了',
    });
  },

  async onLogin() {
    if (this.data.loading) return;
    if (!this.data.privacyAgreed) {
      toast('请先勾选协议', 'none');
      return;
    }
    this.setData({ loading: true });
    showLoading('登录中');
    try {
      const code = await getWxCode();
      const body: WechatLoginRequest = {
        code,
        privacy_version: env.PRIVACY_VERSION,
        agreed_at: new Date().toISOString(),
      };
      const user = await userStore.login(body);
      setStorage(STORAGE_KEYS.PRIVACY_AGREED, body.agreed_at);
      track('login_success', { is_first_login: user.is_first_login });
      hideLoading();
      // 首次登录引导
      const goOnboarding = !!user.is_first_login || !this.getOnboardingDone();
      if (goOnboarding) {
        wx.reLaunch({ url: '/pages/onboarding/index' });
      } else {
        wx.reLaunch({ url: '/pages/home/index' });
      }
    } catch (err) {
      hideLoading();
      this.setData({ loading: false });
      await this.handleLoginError(err);
    }
  },

  onGuest() {
    track('login_guest_click');
    wx.reLaunch({ url: '/pages/home/index' });
  },

  async handleLoginError(err: unknown): Promise<void> {
    if (err instanceof HttpError) {
      if (err.bizCode === ERROR_CODES.ACCOUNT_BANNED) {
        await confirm({
          title: '账号异常',
          content: err.message || '该账号已被封禁,详情请联系客服',
          showCancel: false,
          confirmText: '我知道了',
        });
        return;
      }
      if (err.bizCode === ERROR_CODES.ACCOUNT_CANCELLED) {
        await confirm({
          title: '账号已注销',
          content: '该账号已被注销,如需恢复请联系客服',
          showCancel: false,
          confirmText: '我知道了',
        });
        return;
      }
      if (err instanceof ContentBlockedError) {
        toast('内容被拦截', 'error');
        return;
      }
      toast(err.message || '登录失败', 'error');
      return;
    }
    toast('网络似乎不太顺畅,请稍后重试', 'error');
  },

  getOnboardingDone(): boolean {
    try {
      return wx.getStorageSync(STORAGE_KEYS.ONBOARDING_DONE) === true;
    } catch {
      return false;
    }
  },
});

function getWxCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) return resolve(res.code);
        if (env.DEBUG) return resolve('mock-001');
        reject(new Error('微信 code 获取失败'));
      },
      fail: (err) => {
        if (env.DEBUG) return resolve('mock-001');
        reject(err);
      },
    });
  });
}
