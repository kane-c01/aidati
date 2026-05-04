/// <reference path="./types/app.d.ts" />

App<IAppOption>({
  globalData: {
    accessToken: '',
    refreshToken: '',
    isFirstLaunch: false,
  },

  onLaunch() {
    const accountInfo = wx.getAccountInfoSync();
    console.log('[App] 启动环境:', accountInfo.miniProgram.envVersion);

    try {
      const sysInfo = wx.getDeviceInfo();
      const winInfo = wx.getWindowInfo();
      this.globalData.systemInfo = { ...sysInfo, ...winInfo };
    } catch (err) {
      // 兼容旧版基础库,降级到 getSystemInfoSync
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      this.globalData.systemInfo = wx.getSystemInfoSync();
    }
  },

  onShow() {
    // M8 起接入埋点
  },

  onHide() {
    // M8 起接入埋点
  },
});
