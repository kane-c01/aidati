/**
 * 用户 store
 *
 * 职责:
 *  - 持有 access/refresh/user/stats/quota
 *  - 与 wx.getStorageSync 同步, 启动时 hydrate
 *  - 暴露 isLoggedIn / isAdmin 计算
 *  - 暴露 login/logout/refreshMe 等动作给页面
 */

import { observable, runInAction } from 'mobx-miniprogram';

import { STORAGE_KEYS } from '../config/constants';
import { authService, userService, bindTokenAccessor } from '../services';
import { setTrackUserGetter } from '../utils/tracker';
import { getStorage, removeStorage, setStorage } from '../utils/storage';
import type { CurrentUser, QuotaSnapshot, UserStats } from '../types/domain';
import type { WechatLoginRequest } from '../types/api';

interface UserState {
  accessToken: string;
  refreshToken: string;
  user: CurrentUser | null;
  stats: UserStats | null;
  quota: QuotaSnapshot | null;
  loadingMe: boolean;
}

interface UserComputed {
  isLoggedIn: boolean;
  isAdmin: boolean;
}

interface UserActions {
  hydrate: () => void;
  login: (req: WechatLoginRequest) => Promise<CurrentUser>;
  logout: (silent?: boolean) => Promise<void>;
  refreshMe: () => Promise<void>;
  patchUser: (patch: Partial<CurrentUser>) => void;
  /** 仅供 services/http 使用, 不要在页面里直接调 */
  setTokens: (access: string, refresh: string) => void;
}

export type UserStore = UserState & UserComputed & UserActions;

// 用 as UserStore 让 mobx 内部字段类型保持宽泛, 避免被推导为字面量
const initial = {
  accessToken: '',
  refreshToken: '',
  user: null as CurrentUser | null,
  stats: null as UserStats | null,
  quota: null as QuotaSnapshot | null,
  loadingMe: false,

  get isLoggedIn(): boolean {
    return Boolean((this as UserState).accessToken && (this as UserState).user);
  },
  get isAdmin(): boolean {
    const role = (this as UserState).user?.role;
    return role === 'admin' || role === 'super_admin';
  },

  hydrate(): void {
    const self = this as unknown as UserStore;
    runInAction(() => {
      self.accessToken = getStorage<string>(STORAGE_KEYS.ACCESS_TOKEN, '');
      self.refreshToken = getStorage<string>(STORAGE_KEYS.REFRESH_TOKEN, '');
      self.user = getStorage<CurrentUser | null>(STORAGE_KEYS.USER_INFO, null);
    });
    bindTokenAccessor({
      getAccess: () => userStore.accessToken,
      getRefresh: () => userStore.refreshToken,
      setAccess: (t) => userStore.setTokens(t, userStore.refreshToken),
      setRefresh: (t) => userStore.setTokens(userStore.accessToken, t),
      onLogout: () => {
        void userStore.logout(true);
      },
    });
    setTrackUserGetter(() => userStore.user?.id);
  },

  setTokens(access: string, refresh: string): void {
    const self = this as unknown as UserStore;
    runInAction(() => {
      self.accessToken = access;
      self.refreshToken = refresh;
    });
    setStorage(STORAGE_KEYS.ACCESS_TOKEN, access);
    setStorage(STORAGE_KEYS.REFRESH_TOKEN, refresh);
  },

  async login(req: WechatLoginRequest): Promise<CurrentUser> {
    const self = this as unknown as UserStore;
    const res = await authService.wechatLogin(req);
    runInAction(() => {
      self.accessToken = res.access_token;
      self.refreshToken = res.refresh_token;
      self.user = res.user;
    });
    setStorage(STORAGE_KEYS.ACCESS_TOKEN, res.access_token);
    setStorage(STORAGE_KEYS.REFRESH_TOKEN, res.refresh_token);
    setStorage(STORAGE_KEYS.USER_INFO, res.user);
    void userStore.refreshMe();
    return res.user;
  },

  async logout(silent = false): Promise<void> {
    const self = this as unknown as UserStore;
    if (!silent && self.accessToken) {
      try {
        await authService.logout();
      } catch (err) {
        console.warn('[user] logout failed', err);
      }
    }
    runInAction(() => {
      self.accessToken = '';
      self.refreshToken = '';
      self.user = null;
      self.stats = null;
      self.quota = null;
    });
    removeStorage(STORAGE_KEYS.ACCESS_TOKEN);
    removeStorage(STORAGE_KEYS.REFRESH_TOKEN);
    removeStorage(STORAGE_KEYS.USER_INFO);
  },

  async refreshMe(): Promise<void> {
    const self = this as unknown as UserStore;
    if (!self.accessToken) return;
    runInAction(() => {
      self.loadingMe = true;
    });
    try {
      const res = await userService.getMe();
      runInAction(() => {
        self.user = res.user;
        self.stats = res.stats;
        self.quota = res.today;
      });
      setStorage(STORAGE_KEYS.USER_INFO, res.user);
    } catch (err) {
      console.warn('[user] refreshMe failed', err);
    } finally {
      runInAction(() => {
        self.loadingMe = false;
      });
    }
  },

  patchUser(patch: Partial<CurrentUser>): void {
    const self = this as unknown as UserStore;
    if (!self.user) return;
    runInAction(() => {
      self.user = { ...(self.user as CurrentUser), ...patch };
    });
    setStorage(STORAGE_KEYS.USER_INFO, self.user);
  },
};

export const userStore = observable(initial) as UserStore;
