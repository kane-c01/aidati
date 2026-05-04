/**
 * 全局 App 类型定义
 * 业务字段会在后续里程碑陆续扩展
 */
interface IAppOption {
  globalData: {
    /** 用户登录态 access token */
    accessToken: string;
    /** 用户登录态 refresh token */
    refreshToken: string;
    /** 是否首次启动小程序(用于决定是否展示引导页) */
    isFirstLaunch: boolean;
    /** 系统信息(设备 + 窗口) */
    systemInfo?: WechatMiniprogram.SystemInfo;
    /** 当前用户(M1 起填充) */
    userInfo?: {
      id: string;
      nickname?: string;
      avatarUrl?: string;
      role: 'user' | 'admin' | 'super_admin';
      isMinor: 0 | 1;
      minorModeEnabled: 0 | 1;
    };
  };
  onLaunch?: () => void;
  onShow?: () => void;
  onHide?: () => void;
}
