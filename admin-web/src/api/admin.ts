/**
 * Admin 后台 API 封装
 * 与 backend modules/admin/ + 鉴权接口对齐
 */
import { api } from './http';
import type {
  AdminBookDetail,
  AdminBookView,
  AdminBookViewExt,
  AdminDashboard,
  AdminPhotoSetDetail,
  AdminPhotoSetView,
  AdminPhotoView,
  AdminUserDetail,
  AdminUserView,
  ChapterImportItem,
  CreateBookFromPhotoSetPayload,
  CreateBookPayload,
  LoginPayload,
  LoginResult,
  ModerationLogView,
  OcrStatus,
  PageList,
  SystemConfigView,
  UpdateAdminPhotoPayload,
  UpdateBookPayload,
  UploadPolicyResponse,
  UserMe,
} from '@/types/api';

// ===== 鉴权 =====

export const authApi = {
  wechatLogin: (payload: LoginPayload): Promise<LoginResult> =>
    api.post('/auth/wechat-login', payload),

  /** 后台账号密码登录 */
  adminLogin: (username: string, password: string): Promise<LoginResult> =>
    api.post('/auth/admin-login', { username, password }),

  refresh: (refresh_token: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> =>
    api.post('/auth/refresh', { refresh_token }),

  logout: (): Promise<{ ok: true }> => api.post('/auth/logout'),

  me: (): Promise<UserMe> => api.get('/user/me'),
};

// ===== 工作台 =====

export const dashboardApi = {
  get: (): Promise<AdminDashboard> => api.get('/admin/dashboard'),
  /** 测试 ai-service 是否在线 */
  aiHealth: (): Promise<{ ok: boolean; ts: string }> => api.get('/admin/ai-health'),
};

// ===== 书籍 =====

export interface ListBooksParams {
  keyword?: string;
  status?: '1' | '0' | '-1' | 'all';
  source?: 'admin' | 'user_upload' | 'public_domain' | 'all';
  created_by?: string;
  page?: number;
  page_size?: number;
}

export const bookApi = {
  list: (params: ListBooksParams): Promise<PageList<AdminBookView>> =>
    api.get('/admin/books', params),
  detail: (
    id: string,
    params?: { include_chapter_full?: number | boolean },
  ): Promise<AdminBookDetail> => api.get(`/admin/books/${id}`, params),
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
  /** PDF 自动抽章节(M8):服务端 pdfplumber 抽文字 + LLM 切章 */
  importPdf: (
    id: string,
    payload?: { pdf_url?: string; max_chapters?: number },
  ): Promise<{ imported: number; total: number; pages: number; chapter_hints: number }> =>
    api.post(`/admin/books/${id}/import-pdf`, payload ?? {}),
  /** 从已校对拍照集创建书籍 */
  fromPhotoSet: (payload: CreateBookFromPhotoSetPayload): Promise<AdminBookViewExt> =>
    api.post('/admin/books/from-photo-set', payload),
  /** 将拍照集 OCR 内容导入已有书籍的章节 */
  importFromPhotoSet: (
    id: string,
    photoSetId: string,
  ): Promise<{ imported: number; total: number }> =>
    api.post(`/admin/books/${id}/import-from-photo-set`, { photo_set_id: photoSetId }),
};

// ===== 上传 =====

export const uploadApi = {
  getPolicy: (scene: 'photo' | 'cover' | 'pdf', contentType?: string): Promise<UploadPolicyResponse> =>
    api.get('/upload/policy', { scene, content_type: contentType ?? (scene === 'pdf' ? 'application/pdf' : 'image/jpeg') }),
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
  setCredential: (id: string, username: string, password: string): Promise<AdminUserView> =>
    api.post(`/admin/users/${id}/credential`, { username, password }),
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

// ===== 拍照集 =====

export interface ListPhotoSetsParams {
  keyword?: string;
  user_id?: string;
  ocr_status?: OcrStatus | 'all';
  page?: number;
  page_size?: number;
}

export const photoSetApi = {
  list: (params: ListPhotoSetsParams): Promise<PageList<AdminPhotoSetView>> =>
    api.get('/admin/photo-sets', params),
  detail: (id: string): Promise<AdminPhotoSetDetail> =>
    api.get(`/admin/photo-sets/${id}`),
  patchPhoto: (
    photoId: string,
    payload: UpdateAdminPhotoPayload,
  ): Promise<AdminPhotoView> => api.patch(`/admin/photos/${photoId}`, payload),
  /** 触发单 region 视觉识别(M8) */
  recognizeRegion: (photoId: string, regionId: string): Promise<AdminPhotoView> =>
    api.post(`/admin/photos/${photoId}/regions/${encodeURIComponent(regionId)}/recognize`),
  remove: (id: string): Promise<{ ok: true; deleted_photos: number }> =>
    api.delete(`/admin/photo-sets/${id}`),
};
