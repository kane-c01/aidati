/**
 * App 入口
 *
 * 注:全局 IAppOption 类型来自 types/app.d.ts(declare global), TS 自动加载
 */

import { userStore } from './stores/user';

App<IAppOption>({
  globalData: {
    accessToken: '',
    refreshToken: '',
    isFirstLaunch: false,
  },

  onLaunch() {
    const accountInfo = wx.getAccountInfoSync();
    console.log('[App] 启动环境:', accountInfo.miniProgram.envVersion);

    // 关键:必须在任何页面 onLoad 之前完成 hydrate, 否则 store 永远是登出态
    // 同时它会 bindTokenAccessor 让 services/http 走 store 而非裸 storage
    userStore.hydrate();
    if (userStore.accessToken) {
      void userStore.refreshMe();
    }

    try {
      const sysInfo = wx.getDeviceInfo();
      const winInfo = wx.getWindowInfo();
      // 新 API 拆分了若干字段, 业务侧只用其中很小的子集; 用 cast 兼容旧 SystemInfo 类型
      this.globalData.systemInfo = { ...sysInfo, ...winInfo } as unknown as WechatMiniprogram.SystemInfo;
    } catch {
      // 兼容旧版基础库,降级到 getSystemInfoSync
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      this.globalData.systemInfo = wx.getSystemInfoSync();
    }
  },

  onShow() {
    // M8 起接入埋点

    // 隐藏小程序右上角胶囊左侧的"返回首页"按钮
    // 仅在用户从分享卡片等场景进入非首页时出现, 主流程里不需要
    try {
      if (typeof wx.hideHomeButton === 'function') {
        wx.hideHomeButton({ fail: () => undefined });
      }
    } catch {
      // older 基础库, 忽略
    }
  },

  onHide() {
    // M8 起接入埋点
  },
});
