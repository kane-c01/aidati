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
   * 'vision': 服务端 VL 大模型自动识别(推荐)
   * 'wechat': 客户端 wx.ocr 识别后写回
   * 'mock': 后端固定占位(调试)
   * 'tencent': 腾讯云 OCR(未实现)
   */
  mode?: 'vision' | 'wechat' | 'mock' | 'tencent';
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
  /** photo_set 模式可选: 仅以列出的 photo_id 计入出题文本(undefined/缺省 = 全用) */
  selected_photo_ids?: string[];
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

// ===== 收藏 =====

export interface FavoriteListQuery {
  page?: number;
  page_size?: number;
}

export interface FavoriteItem {
  id: string;
  book_id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  description: string | null;
  tags: unknown;
  is_recommended: boolean;
  is_favorited: true;
  created_at: string;
}

export type FavoriteListResponse = PaginatedData<FavoriteItem>;

export interface AddFavoriteRequest {
  book_id: string;
}

export interface AddFavoriteResponse {
  id: string;
  favorited: true;
}

// ===== 历史试卷 =====

export type PaperHistoryStatus = 'all' | 'ready' | 'submitted' | 'graded';

export interface PaperHistoryQuery {
  status?: PaperHistoryStatus;
  book_id?: string;
  chapter_id?: string;
  page?: number;
  page_size?: number;
}

export interface PaperHistoryItem {
  id: string;
  status: PaperStatus;
  source_type: PaperSourceType;
  total_questions: number;
  created_at: string;

  book_id: string | null;
  book_title: string | null;
  chapter_id: string | null;
  chapter_title: string | null;
  photo_set_id: string | null;
  photo_set_name: string | null;

  total_score: number | null;
  max_score: number | null;
  accuracy: number | null;
  time_spent_sec: number | null;
  answered_count: number;
}

export type PaperHistoryResponse = PaginatedData<PaperHistoryItem>;

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
