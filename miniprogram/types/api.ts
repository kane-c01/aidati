/**
 * 后端 HTTP 接口数据契约(请求/响应)
 *
 * 与 03-API接口文档.md §一(通用) 对齐:
 * - 统一响应壳: { code, message, data, request_id }
 * - 时间字段: ISO 8601 UTC 字符串
 * - ID: BIGINT, JSON 中以字符串返回
 *
 * 注:这里只定义跨服务的传输结构, **领域类型** 见 ./domain.ts
 */

import type {
  AnswerItem,
  Book,
  Chapter,
  CurrentUser,
  GenerateConfig,
  MistakeItem,
  MistakeStatus,
  MistakeSummary,
  Paper,
  PaperResult,
  PaperSourceType,
  PaperStatus,
  PhotoSet,
  QuotaSnapshot,
  UploadPolicy,
  UploadScene,
  UserStats,
} from './domain';

export type { UploadScene } from './domain';

// ===== 通用 =====

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  request_id?: string;
}

export interface Pagination {
  page: number;
  page_size: number;
  total: number;
}

export interface PaginatedData<T> {
  list: T[];
  pagination: Pagination;
}

// ===== 鉴权 =====

export interface WechatLoginRequest {
  code: string;
  user_info?: {
    nickname?: string;
    avatar_url?: string;
  };
  privacy_version: string;
  agreed_at: string;
}

export interface WechatLoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: CurrentUser;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

// ===== 用户 =====

export interface MeResponse {
  user: CurrentUser;
  stats: UserStats;
  today: QuotaSnapshot;
}

export interface UpdateProfileRequest {
  nickname?: string;
  avatar_url?: string;
  is_minor?: 0 | 1;
  minor_mode_enabled?: 0 | 1;
}

export interface PrivacyStatusResponse {
  current_version: string;
  agreed_version: string | null;
  needs_reagree: boolean;
  agreed_at: string | null;
}

export interface FeedbackRequest {
  content: string;
  contact?: string;
  screenshots?: string[];
}

// ===== 书籍 =====

export interface BookListQuery {
  keyword?: string;
  category?: string;
  page?: number;
  page_size?: number;
  sort?: 'recommended' | 'latest' | 'hot';
}

export type BookListResponse = PaginatedData<Book>;

export interface BookDetailResponse {
  book: Book;
  chapters: Chapter[];
}

// ===== 上传 =====

export interface UploadPolicyQuery {
  scene: UploadScene;
}

export type UploadPolicyResponse = UploadPolicy;

export interface BindPhotoRequest {
  photo_set_id: string | null;
  image_url: string;
  order_no: number;
}

export interface BindPhotoResponse {
  photo_id: string;
  photo_set_id: string;
}

export interface ReorderPhotosRequest {
  items: Array<{ id: string; order_no: number }>;
}

// ===== OCR =====

export interface StartOcrRequest {
  /**
   * 'wechat': 客户端用 wx.ocr 识别后写回; 'mock': 后端固定占位; 'tencent': 后端调腾讯云
   */
  mode?: 'wechat' | 'mock' | 'tencent';
}

export interface StartOcrResponse {
  task_id: string;
  estimated_seconds: number;
}

export type OcrStatusResponse = PhotoSet;

export interface PatchOcrRequest {
  items: Array<{ photo_id: string; ocr_text: string }>;
}

// ===== 试卷 =====

export interface CreatePaperRequest {
  source_type: PaperSourceType;
  book_id?: string;
  chapter_ids?: string[];
  photo_set_id?: string;
  config: GenerateConfig;
}

export interface CreatePaperResponse {
  paper_id: string;
  status: PaperStatus;
  estimated_seconds: number;
}

export interface PaperDetailResponse {
  paper: Paper;
}

export interface SaveDraftRequest {
  answers: AnswerItem[];
}

export interface SubmitAnswersRequest {
  answers: AnswerItem[];
  total_time_sec?: number;
}

export interface SubmitAnswersResponse {
  result_id: string;
  status: PaperStatus;
  estimated_seconds: number;
}

export type PaperResultResponse = PaperResult;

// ===== 错题本 =====

export interface MistakeListQuery {
  status?: MistakeStatus;
  book_id?: string;
  page?: number;
  page_size?: number;
}

export interface MistakeListResponse {
  list: MistakeItem[];
  pagination: Pagination;
  summary: MistakeSummary;
}

export interface PracticeMistakeRequest {
  mistake_ids?: string[];
  include_book_id?: string | null;
}

export interface PracticeMistakeResponse {
  paper_id: string;
}
