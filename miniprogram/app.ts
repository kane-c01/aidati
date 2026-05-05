/**
 * App 入口
 *
 * 注:全局 IAppOption 类型来自 types/app.d.ts(declare global), TS 自动加载
 *
 * 启动时统一把:
 *  1) 用户态从 storage hydrate 进 userStore + 给 services/http 注入 token accessor
 *  2) 网络监听初始化(给页面订阅断网/恢复)
 *  3) 全局错误上报(Sentry 接入位)
 *  4) 埋点全局上下文(track 的 user_id 取 userStore)
 */

import { STORAGE_KEYS } from './config/constants';
import { initNetworkWatcher } from './utils/network';
import { flushTrackerOnHide, track } from './utils/tracker';
import { userStore } from './stores/user';
import { getStorage, setStorage } from './utils/storage';

App<IAppOption>({
  globalData: {
    accessToken: '',
    refreshToken: '',
    isFirstLaunch: false,
  },

  onLaunch(opts) {
    const accountInfo = wx.getAccountInfoSync();
    console.log('[App] 启动环境:', accountInfo.miniProgram.envVersion);

    try {
      const sysInfo = wx.getDeviceInfo();
      const winInfo = wx.getWindowInfo();
      this.globalData.systemInfo = {
        ...sysInfo,
        ...winInfo,
      } as unknown as WechatMiniprogram.SystemInfo;
    } catch {
      this.globalData.systemInfo = wx.getSystemInfoSync() as WechatMiniprogram.SystemInfo;
    }

    this.globalData.launchScene = opts.scene;

    // 1) 注水 user store + 把 token 接入 services/http
    userStore.hydrate();
    this.globalData.accessToken = userStore.accessToken;
    this.globalData.refreshToken = userStore.refreshToken;
    if (userStore.user) this.globalData.userInfo = userStore.user;

    // 2) 全局网络监听
    initNetworkWatcher();

    // 3) 首次启动判定(用 storage 标记)
    const onboardingDone = getStorage<boolean>(STORAGE_KEYS.ONBOARDING_DONE, false);
    this.globalData.isFirstLaunch = !onboardingDone;
    if (!onboardingDone) {
      // 先不写 true, 等用户在引导页点完「立即开始」再标记
      setStorage(STORAGE_KEYS.ONBOARDING_DONE, false);
    }

    // 4) 启动埋点
    track('app_launch', { scene: opts.scene });

    // 5) 已登录就异步刷统计/配额
    if (userStore.isLoggedIn) {
      void userStore.refreshMe();
    }
  },

  onShow() {
    track('app_show');
  },

  onHide() {
    track('app_hide');
    flushTrackerOnHide();
  },
});
