/**
 * Admin 后台 API 封装
 * 与 backend modules/admin/ + 鉴权接口对齐
 */
import { api } from './http';
import type {
  AdminBookDetail,
  AdminBookView,
  AdminDashboard,
  AdminUserDetail,
  AdminUserView,
  ChapterImportItem,
  CreateBookPayload,
  LoginPayload,
  LoginResult,
  ModerationLogView,
  PageList,
  SystemConfigView,
  UpdateBookPayload,
  UserMe,
} from '@/types/api';

// ===== 鉴权 =====

export const authApi = {
  wechatLogin: (payload: LoginPayload): Promise<LoginResult> =>
    api.post('/auth/wechat-login', payload),

  refresh: (refresh_token: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> =>
    api.post('/auth/refresh', { refresh_token }),

  logout: (): Promise<{ ok: true }> => api.post('/auth/logout'),

  me: (): Promise<UserMe> => api.get('/user/me'),
};

// ===== 工作台 =====

export const dashboardApi = {
  get: (): Promise<AdminDashboard> => api.get('/admin/dashboard'),
};

// ===== 书籍 =====

export interface ListBooksParams {
  keyword?: string;
  status?: '1' | '0' | '-1' | 'all';
  created_by?: string;
  page?: number;
  page_size?: number;
}

export const bookApi = {
  list: (params: ListBooksParams): Promise<PageList<AdminBookView>> =>
    api.get('/admin/books', params),
  detail: (id: string): Promise<AdminBookDetail> => api.get(`/admin/books/${id}`),
  create: (payload: CreateBookPayload): Promise<AdminBookView> =>
    api.post('/admin/books', payload),
  update: (id: string, payload: UpdateBookPayload): Promise<AdminBookView> =>
    api.patch(`/admin/books/${id}`, payload),
  remove: (id: string): Promise<{ ok: true }> => api.delete(`/admin/books/${id}`),
  recommend: (id: string): Promise<AdminBookView> => api.post(`/admin/books/${id}/recommend`),
  unrecommend: (id: string): Promise<AdminBookView> => api.post(`/admin/books/${id}/unrecommend`),
  online: (id: string): Promise<AdminBookView> => api.post(`/admin/books/${id}/online`),
  offline: (id: string): Promise<AdminBookView> => api.post(`/admin/books/${id}/offline`),
  importChapters: (
    id: string,
    payload: { chapters: ChapterImportItem[]; replace?: boolean },
  ): Promise<{ imported: number; total: number }> =>
    api.post(`/admin/books/${id}/chapters`, payload),
};

// ===== 用户 =====

export interface ListUsersParams {
  keyword?: string;
  status?: '1' | '0' | '-1' | 'all';
  role?: 'user' | 'admin' | 'super_admin' | 'all';
  page?: number;
  page_size?: number;
}

export const userApi = {
  list: (params: ListUsersParams): Promise<PageList<AdminUserView>> =>
    api.get('/admin/users', params),
  detail: (id: string): Promise<AdminUserDetail> => api.get(`/admin/users/${id}`),
  ban: (id: string, reason?: string, durationDays?: number): Promise<AdminUserView> =>
    api.post(`/admin/users/${id}/ban`, {
      reason,
      duration_days: durationDays,
    }),
  unban: (id: string): Promise<AdminUserView> => api.post(`/admin/users/${id}/unban`),
  promote: (id: string): Promise<AdminUserView> => api.post(`/admin/users/${id}/promote`),
  demote: (id: string): Promise<AdminUserView> => api.post(`/admin/users/${id}/demote`),
};

// ===== 系统配置 (super_admin) =====

export const configApi = {
  list: (): Promise<SystemConfigView[]> => api.get('/admin/configs'),
  update: (key: string, value: unknown, description?: string): Promise<SystemConfigView> =>
    api.put(`/admin/configs/${encodeURIComponent(key)}`, { value, description }),
};

// ===== 内容审核日志 =====

export interface ListAuditsParams {
  scene?: string;
  result?: 'pass' | 'block' | 'warn';
  user_id?: string;
  from?: string;
  to?: string;
  page?: number;
  page_size?: number;
}

export const moderationApi = {
  list: (params: ListAuditsParams): Promise<PageList<ModerationLogView>> =>
    api.get('/admin/moderation-logs', params),
};
