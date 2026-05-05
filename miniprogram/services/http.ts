/**
 * HTTP 客户端封装(基于 wx.request)
 *
 * 设计要点(参考 04-前端规范 §3.3 + 03-API §1.3):
 * - 统一注入 Authorization / X-Request-Id / X-Client-Version / Idempotency-Key
 * - 401 自动 refresh + 单飞重放, 防止并发雪崩
 * - 422 / 429 / 5xx 走专用 BizError 子类, UI 层判类型给反馈
 * - 业务码 code !== 0 也抛 BizError(message 透传)
 * - 不写重试: 出题/批改长任务由 paper service 的轮询负责
 *
 * 这里**不依赖** stores/, 避免循环引用; auth token 通过 setter 注入。
 */

import { ERROR_CODES, STORAGE_KEYS } from '../config/constants';
import { env } from '../config/env';
import { getStorage, removeStorage, setStorage } from '../utils/storage';
import { uuid } from '../utils/uuid';
import type { ApiResponse } from '../types/api';

// ===== 错误体系 =====

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public bizCode: number,
    message: string,
    public requestId?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class NetworkError extends HttpError {
  constructor(message = '网络似乎不太顺畅,请检查网络后重试') {
    super(0, -1, message);
    this.name = 'NetworkError';
  }
}

export class TokenExpiredError extends HttpError {
  constructor() {
    super(401, ERROR_CODES.TOKEN_INVALID, '登录已过期,请重新登录');
    this.name = 'TokenExpiredError';
  }
}

export class RateLimitError extends HttpError {
  constructor(message = '操作过快, 请稍候再试') {
    super(429, ERROR_CODES.RATE_LIMITED, message);
    this.name = 'RateLimitError';
  }
}

export class ContentBlockedError extends HttpError {
  constructor(bizCode: number, message: string) {
    super(422, bizCode, message);
    this.name = 'ContentBlockedError';
  }
}

export class QuotaExceededError extends HttpError {
  constructor(message = '今日额度已用尽,明日 0 点重置') {
    super(429, ERROR_CODES.QUOTA_EXCEEDED, message);
    this.name = 'QuotaExceededError';
  }
}

// ===== Token 注入接口 =====

interface TokenAccessor {
  getAccess: () => string;
  getRefresh: () => string;
  setAccess: (t: string) => void;
  setRefresh: (t: string) => void;
  onLogout: () => void;
}

const tokenAccessor: TokenAccessor = {
  getAccess: () => getStorage<string>(STORAGE_KEYS.ACCESS_TOKEN, ''),
  getRefresh: () => getStorage<string>(STORAGE_KEYS.REFRESH_TOKEN, ''),
  setAccess: (t) => setStorage(STORAGE_KEYS.ACCESS_TOKEN, t),
  setRefresh: (t) => setStorage(STORAGE_KEYS.REFRESH_TOKEN, t),
  onLogout: () => {
    removeStorage(STORAGE_KEYS.ACCESS_TOKEN);
    removeStorage(STORAGE_KEYS.REFRESH_TOKEN);
    removeStorage(STORAGE_KEYS.USER_INFO);
  },
};

/** 用 store 替换默认 token 实现(在 app onLaunch 时调用) */
export function bindTokenAccessor(partial: Partial<TokenAccessor>): void {
  Object.assign(tokenAccessor, partial);
}

// ===== Refresh 单飞 =====

let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const rt = tokenAccessor.getRefresh();
  if (!rt) return false;
  try {
    const res = await rawRequest<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>({
      method: 'POST',
      url: '/auth/refresh',
      data: { refresh_token: rt },
      _skipAuth: true,
    });
    if (res.code === 0 && res.data?.access_token) {
      tokenAccessor.setAccess(res.data.access_token);
      tokenAccessor.setRefresh(res.data.refresh_token);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[http] refresh failed', err);
    return false;
  }
}

// ===== 主请求 =====

export interface RequestOpts {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  data?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  header?: Record<string, string>;
  /** 客户端整体超时(ms), 默认 15000 */
  timeout?: number;
  /** 创建类接口建议设, 同 key 重复请求后端会拒第二次 */
  idempotencyKey?: string;
  /** 内部用, 跳过 401 自动刷新(refresh 自身) */
  _skipAuth?: boolean;
}

function buildQuery(query?: RequestOpts['query']): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

function rawRequest<T>(opts: RequestOpts): Promise<ApiResponse<T>> {
  const url = `${env.API_BASE}${opts.url}${buildQuery(opts.query)}`;
  const reqId = uuid();
  const header: Record<string, string> = {
    'content-type': 'application/json',
    'X-Request-Id': reqId,
    'X-Client-Version': `miniprogram/${env.CLIENT_VERSION}`,
    ...(opts.header ?? {}),
  };
  if (!opts._skipAuth) {
    const access = tokenAccessor.getAccess();
    if (access) header.Authorization = `Bearer ${access}`;
  }
  if (opts.idempotencyKey) header['Idempotency-Key'] = opts.idempotencyKey;

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      // 注: PATCH 在部分基础库 typings 里没列出, 这里强转, 实际真机可用
      method: opts.method as 'POST' | 'GET' | 'PUT' | 'DELETE',
      data: opts.data as WechatMiniprogram.RequestOption['data'],
      header,
      timeout: opts.timeout ?? 15_000,
      success: (res) => resolve(toApiResponse<T>(res, reqId)),
      fail: (err) => {
        if (env.DEBUG) console.error('[http] fail', opts.method, url, err);
        reject(new NetworkError(err.errMsg ? mapWxErrMsg(err.errMsg) : undefined));
      },
    });
  });
}

function toApiResponse<T>(
  res: WechatMiniprogram.RequestSuccessCallbackResult,
  reqId: string,
): ApiResponse<T> {
  // 后端约定: 任何错误也包成 { code, message, data, request_id } 结构
  if (typeof res.data === 'object' && res.data !== null) {
    const body = res.data as Partial<ApiResponse<T>>;
    return {
      code: typeof body.code === 'number' ? body.code : res.statusCode,
      message: body.message ?? '',
      data: body.data as T,
      request_id: body.request_id ?? reqId,
    };
  }
  return {
    code: res.statusCode,
    message: typeof res.data === 'string' ? res.data : '',
    data: undefined as unknown as T,
    request_id: reqId,
  };
}

function mapWxErrMsg(errMsg: string): string {
  if (errMsg.includes('timeout')) return '请求超时,请稍后再试';
  if (errMsg.includes('fail')) return '网络似乎不太顺畅,请检查网络后重试';
  return errMsg;
}

/**
 * 主请求入口: 统一异常映射 + 401 自动刷新单飞
 */
export async function request<T = unknown>(opts: RequestOpts): Promise<T> {
  const res = await rawRequest<T>(opts);

  // 业务码优先于 HTTP 状态码: 后端在 200 + code !== 0 时也算业务错
  // 422 内容拦截
  if (res.code === ERROR_CODES.CONTENT_BLOCKED_SENSITIVE || res.code === ERROR_CODES.CONTENT_BLOCKED_ILLEGAL) {
    throw new ContentBlockedError(res.code, res.message || '内容包含不适宜信息,无法继续,请更换其他素材');
  }
  // 30001 配额耗尽
  if (res.code === ERROR_CODES.QUOTA_EXCEEDED) {
    throw new QuotaExceededError(res.message || undefined);
  }
  // 401 / 20001 token 过期 — 单飞 refresh 后重放一次
  if (res.code === ERROR_CODES.TOKEN_INVALID || res.code === 401) {
    if (opts._skipAuth) {
      throw new TokenExpiredError();
    }
    if (!refreshing) refreshing = doRefresh().finally(() => (refreshing = null));
    const ok = await refreshing;
    if (!ok) {
      tokenAccessor.onLogout();
      throw new TokenExpiredError();
    }
    return request<T>(opts);
  }
  // 429 限流
  if (res.code === ERROR_CODES.RATE_LIMITED || res.code === 429) {
    throw new RateLimitError(res.message || undefined);
  }
  // 其它业务码
  if (res.code !== 0) {
    throw new HttpError(res.code, res.code, res.message || `请求失败 (${res.code})`, res.request_id);
  }
  return res.data;
}

export const http = {
  get: <T = unknown>(url: string, query?: RequestOpts['query'], opts?: Partial<RequestOpts>) =>
    request<T>({ method: 'GET', url, query, ...opts }),
  post: <T = unknown>(url: string, data?: unknown, opts?: Partial<RequestOpts>) =>
    request<T>({ method: 'POST', url, data, ...opts }),
  put: <T = unknown>(url: string, data?: unknown, opts?: Partial<RequestOpts>) =>
    request<T>({ method: 'PUT', url, data, ...opts }),
  patch: <T = unknown>(url: string, data?: unknown, opts?: Partial<RequestOpts>) =>
    request<T>({ method: 'PATCH', url, data, ...opts }),
  del: <T = unknown>(url: string, opts?: Partial<RequestOpts>) =>
    request<T>({ method: 'DELETE', url, ...opts }),
};

// ===== 文件上传(走 wx.uploadFile, 直传 OSS) =====

export interface UploadResult {
  ok: boolean;
  statusCode: number;
  message?: string;
}

/**
 * 走 wx.uploadFile 把本地文件直传到 OSS 给的 put_url
 *
 * 注:OSS 直传不能加 Authorization 头
 */
export function uploadToOss(opts: {
  filePath: string;
  putUrl: string;
  formData?: Record<string, string>;
  fieldName?: string;
}): Promise<UploadResult> {
  return new Promise((resolve) => {
    wx.uploadFile({
      url: opts.putUrl,
      filePath: opts.filePath,
      name: opts.fieldName ?? 'file',
      formData: opts.formData,
      success: (res) => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode, message: res.data }),
      fail: (err) => resolve({ ok: false, statusCode: 0, message: err.errMsg }),
    });
  });
}
