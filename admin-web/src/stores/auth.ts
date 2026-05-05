import { defineStore } from 'pinia';

import { authApi } from '@/api/admin';
import { tokenStore } from '@/api/http';
import type { LoginPayload, UserBrief, UserRole } from '@/types/api';

const USER_KEY = 'aq.admin.user';

interface AuthState {
  user: UserBrief | null;
  hydrated: boolean;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    hydrated: false,
  }),

  getters: {
    isLoggedIn: (s): boolean => !!s.user && !!tokenStore.getAccess(),
    role: (s): UserRole | null => s.user?.role ?? null,
    isSuperAdmin: (s): boolean => s.user?.role === 'super_admin',
    isAdminLike: (s): boolean =>
      s.user?.role === 'admin' || s.user?.role === 'super_admin',
    displayName: (s): string => s.user?.nickname ?? '未命名管理员',
  },

  actions: {
    hydrate(): void {
      const raw = localStorage.getItem(USER_KEY);
      if (!raw) {
        this.hydrated = true;
        return;
      }
      try {
        const u = JSON.parse(raw) as UserBrief;
        if (u && typeof u === 'object' && u.id) this.user = u;
      } catch {
        /* corrupted, ignore */
      }
      this.hydrated = true;
    },

    async login(payload: LoginPayload): Promise<UserBrief> {
      const res = await authApi.wechatLogin(payload);
      return this.absorbLoginResult(res);
    },

    /** 后台账号密码登录(主流程) */
    async adminLogin(username: string, password: string): Promise<UserBrief> {
      const res = await authApi.adminLogin(username, password);
      return this.absorbLoginResult(res);
    },

    /** 把登录响应写入 token / user store, 校验角色 */
    absorbLoginResult(res: { access_token: string; refresh_token: string; user: UserBrief }): UserBrief {
      tokenStore.setTokens(res.access_token, res.refresh_token);
      const user: UserBrief = {
        id: res.user.id,
        nickname: res.user.nickname,
        avatar_url: res.user.avatar_url,
        role: res.user.role,
        is_minor: res.user.is_minor,
        minor_mode_enabled: res.user.minor_mode_enabled,
      };
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        tokenStore.clear();
        throw new Error('当前账号没有管理员权限');
      }
      this.user = user;
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return user;
    },

    async refreshMe(): Promise<void> {
      try {
        const me = await authApi.me();
        this.user = me.user;
        localStorage.setItem(USER_KEY, JSON.stringify(me.user));
      } catch {
        // 401 已被 http 层处理, 这里不再额外提示
      }
    },

    async logout(): Promise<void> {
      try {
        await authApi.logout();
      } catch {
        /* ignore */
      }
      this.user = null;
      tokenStore.clear();
    },
  },
});
