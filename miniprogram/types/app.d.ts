/**
 * 全局 App 类型定义
 *
 * globalData 字段:
 * - 仅放「与生命周期/启动配置」相关的内容
 * - 业务态(用户/试卷/错题等)放 stores/, 不要塞 globalData
 */

import type { CurrentUser } from './domain';

declare global {
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
      /** 当前用户(登录后填充, 由 user store 镜像) */
      userInfo?: CurrentUser;
      /** 启动场景值 */
      launchScene?: number;
    };
    onLaunch?: (opts: WechatMiniprogram.App.LaunchShowOption) => void;
    onShow?: (opts: WechatMiniprogram.App.LaunchShowOption) => void;
    onHide?: () => void;
  }
}

export {};
