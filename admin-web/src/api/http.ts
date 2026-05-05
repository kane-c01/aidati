import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { ElMessage, ElMessageBox } from 'element-plus';

import type { ApiResponse } from '@/types/api';

const STORAGE_KEYS = {
  ACCESS: 'aq.admin.access_token',
  REFRESH: 'aq.admin.refresh_token',
  USER: 'aq.admin.user',
} as const;

export const tokenStore = {
  getAccess: (): string => localStorage.getItem(STORAGE_KEYS.ACCESS) ?? '',
  getRefresh: (): string => localStorage.getItem(STORAGE_KEYS.REFRESH) ?? '',
  setTokens: (access: string, refresh: string): void => {
    localStorage.setItem(STORAGE_KEYS.ACCESS, access);
    localStorage.setItem(STORAGE_KEYS.REFRESH, refresh);
  },
  clear: (): void => {
    localStorage.removeItem(STORAGE_KEYS.ACCESS);
    localStorage.removeItem(STORAGE_KEYS.REFRESH);
    localStorage.removeItem(STORAGE_KEYS.USER);
  },
};

export class ApiError extends Error {
  constructor(
    public code: number,
    message: string,
    public requestId?: string,
    public httpStatus?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const ERROR_CODES = {
  TOKEN_INVALID: 20001,
  PERMISSION_DENIED: 20005,
  RATE_LIMITED: 10003,
  CONTENT_SENSITIVE: 40001,
  CONTENT_ILLEGAL: 40002,
  QUOTA_EXCEEDED: 30001,
} as const;

interface RequestExt {
  _skipAuth?: boolean;
  _retried?: boolean;
}

function buildHttp(): AxiosInstance {
  const baseURL = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
  const http = axios.create({
    baseURL: baseURL.endsWith('/v1') ? baseURL : `${baseURL || ''}/v1`,
    timeout: 30_000,
    headers: { 'Content-Type': 'application/json' },
  });

  http.interceptors.request.use((cfg: InternalAxiosRequestConfig & RequestExt) => {
    cfg.headers = cfg.headers ?? {};
    if (!cfg._skipAuth) {
      const token = tokenStore.getAccess();
      if (token) cfg.headers.Authorization = `Bearer ${token}`;
    }
    cfg.headers['X-Client-Version'] =
      (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'admin-web/0.1.0';
    return cfg;
  });

  http.interceptors.response.use(
    (resp: AxiosResponse<ApiResponse<unknown>>) => resp,
    async (err) => {
      if (!err.response) {
        ElMessage.error('网络似乎不太顺畅, 请检查网络');
        throw new ApiError(0, err.message ?? '网络错误');
      }
      const status = err.response.status as number;
      const body = err.response.data as Partial<ApiResponse<unknown>> | undefined;
      const code = typeof body?.code === 'number' ? body.code : status;
      const message = body?.message ?? err.message ?? `请求失败 (${status})`;
      const requestId = body?.request_id;

      // 401 + token 失效:试图 refresh 一次
      if (
        (status === 401 || code === ERROR_CODES.TOKEN_INVALID) &&
        !(err.config as RequestExt)._retried &&
        !(err.config as RequestExt)._skipAuth
      ) {
        const ok = await refreshTokenSingleflight();
        if (ok) {
          (err.config as RequestExt)._retried = true;
          return http.request(err.config as AxiosRequestConfig);
        }
        tokenStore.clear();
        // 跳到登录页
        if (location.pathname !== '/login') {
          ElMessageBox.alert('登录已过期, 请重新登录', '提示', {
            confirmButtonText: '去登录',
            type: 'warning',
          })
            .then(() => {
              location.href = '/login';
            })
            .catch(() => {
              location.href = '/login';
            });
        }
        throw new ApiError(code, '登录已过期', requestId, status);
      }

      // 403 + 20005:权限不足
      if (code === ERROR_CODES.PERMISSION_DENIED) {
        ElMessage.warning(message);
      } else if (code === ERROR_CODES.RATE_LIMITED) {
        ElMessage.warning('操作过快, 请稍后再试');
      } else if (
        code === ERROR_CODES.CONTENT_SENSITIVE ||
        code === ERROR_CODES.CONTENT_ILLEGAL
      ) {
        ElMessage.error(`内容审核未通过: ${message}`);
      } else if (code === ERROR_CODES.QUOTA_EXCEEDED) {
        ElMessage.warning(message);
      } else if (status >= 500) {
        ElMessage.error('服务异常, 请稍后再试');
      } else {
        ElMessage.error(message);
      }
      throw new ApiError(code, message, requestId, status);
    },
  );

  return http;
}

const httpInstance = buildHttp();

// ===== refresh single-flight =====

let refreshing: Promise<boolean> | null = null;
async function refreshTokenSingleflight(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const rt = tokenStore.getRefresh();
    if (!rt) return false;
    try {
      const res = await httpInstance.post<ApiResponse<{ access_token: string; refresh_token: string }>>(
        '/auth/refresh',
        { refresh_token: rt },
        { _skipAuth: true } as AxiosRequestConfig & RequestExt,
      );
      const data = res.data?.data;
      if (res.data.code === 0 && data?.access_token) {
        tokenStore.setTokens(data.access_token, data.refresh_token);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// ===== 业务包装(把 ApiResponse 拆掉, 业务码 != 0 抛 ApiError) =====

async function unwrap<T>(p: Promise<AxiosResponse<ApiResponse<T>>>): Promise<T> {
  const res = await p;
  const body = res.data;
  if (body.code !== 0) {
    throw new ApiError(body.code, body.message, body.request_id, res.status);
  }
  return body.data;
}

export const api = {
  get<T>(url: string, params?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return unwrap<T>(httpInstance.get<ApiResponse<T>>(url, { params, ...config }));
  },
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return unwrap<T>(httpInstance.post<ApiResponse<T>>(url, data, config));
  },
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return unwrap<T>(httpInstance.put<ApiResponse<T>>(url, data, config));
  },
  patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return unwrap<T>(httpInstance.patch<ApiResponse<T>>(url, data, config));
  },
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return unwrap<T>(httpInstance.delete<ApiResponse<T>>(url, config));
  },
};

declare module 'axios' {
  // 给 axios 的 RequestConfig 加上自定义字段(_skipAuth / _retried)
  interface AxiosRequestConfig {
    _skipAuth?: boolean;
    _retried?: boolean;
  }
}
