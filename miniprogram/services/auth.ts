/**
 * 鉴权 / 用户登录
 *
 * 03-API §2.1 - 2.5 + §3
 */

import { http } from './http';
import type {
  ApiResponse,
  PrivacyStatusResponse,
  RefreshTokenResponse,
  WechatLoginRequest,
  WechatLoginResponse,
} from '../types/api';

export const authService = {
  wechatLogin(body: WechatLoginRequest): Promise<WechatLoginResponse> {
    return http.post<WechatLoginResponse>('/auth/wechat-login', body);
  },

  refresh(refresh_token: string): Promise<RefreshTokenResponse> {
    return http.post<RefreshTokenResponse>('/auth/refresh', { refresh_token });
  },

  logout(): Promise<void> {
    return http.post<void>('/auth/logout');
  },

  getPrivacyStatus(): Promise<PrivacyStatusResponse> {
    return http.get<PrivacyStatusResponse>('/user/me/privacy');
  },

  agreePrivacy(version: string): Promise<{ ok: true }> {
    return http.post<{ ok: true }>('/user/me/privacy/agree', { version });
  },

  /** 申请注销 → 进入 7 天冷静期 */
  cancelAccount(reason?: string): Promise<{ scheduled_delete_at: string; cancel_window_seconds: number }> {
    return http.post('/user/cancel', { reason });
  },

  /** 撤销注销 */
  revokeCancel(): Promise<{ ok: true }> {
    return http.post('/user/cancel/cancel');
  },
};

export type { ApiResponse };
