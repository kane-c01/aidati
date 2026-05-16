/**
 * 与后端 03-API §1.2 严格对齐的统一响应壳
 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  request_id: string;
}

export interface Pagination {
  page: number;
  page_size: number;
  total: number;
}

export interface PageList<T> {
  list: T[];
  pagination: Pagination;
}

export type UserRole = 'user' | 'admin' | 'super_admin';

// ===== 鉴权 =====

export interface LoginPayload {
  code: string;
  user_info?: { nickname?: string; avatar_url?: string };
  privacy_version?: string;
  agreed_at?: string;
}

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: UserBrief & { is_first_login: boolean };
}

export interface UserBrief {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  role: UserRole;
}

export interface UserMe {
  user: UserBrief;
  stats: {
    total_papers: number;
    total_questions: number;
    accuracy_rate: number;
    active_mistakes: number;
    mastered_mistakes: number;
  };
  today: {
    used_quota: number;
    limit: number;
    reset_at: string;
  };
}

// ===== Dashboard =====

export interface AdminDashboard {
  today: {
    date: string;
    dau: number;
    new_users: number;
    papers_created: number;
    papers_graded: number;
    ai_cost: number;
  };
  pending: {
    moderation_block_7d: number;
    moderation_block_24h: number;
    book_uploads_pending: number;
    reports_pending: number;
    appeals_pending: number;
  };
  totals: {
    users: number;
    books_published: number;
    papers_total: number;
    mistakes_active: number;
  };
  reset_at: string;
}

// ===== 书籍 =====

export interface AdminBookView {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  description: string | null;
  cover_url: string | null;
  pdf_url: string | null;
  pdf_pages: number | null;
  tags: unknown;
  source: 'admin' | 'user_upload' | 'public_domain';
  copyright_status: string | null;
  status: number;
  is_recommended: boolean;
  sort_weight: number;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  chapters_count: number;
}

export interface AdminBookDetail extends AdminBookView {
  chapters: ChapterAdminView[];
}

export interface ChapterAdminView {
  id: string;
  order_no: number;
  title: string;
  start_page: number | null;
  end_page: number | null;
  content_summary: string | null;
  content_length: number;
  /** 详情接口 include_chapter_full=1 时返回 */
  content_full?: string | null;
}

export interface CreateBookPayload {
  title: string;
  author?: string;
  isbn?: string;
  description?: string;
  cover_url?: string;
  pdf_url?: string;
  pdf_pages?: number;
  tags?: string[];
  copyright_status?: 'public_domain' | 'licensed' | 'user_claimed' | 'unknown';
}

export interface UpdateBookPayload extends Partial<CreateBookPayload> {
  sort_weight?: number;
}

export interface CreateBookFromPhotoSetPayload {
  photo_set_id: string;
  title: string;
  author?: string;
  description?: string;
  cover_url?: string;
  tags?: string[];
  copyright_status?: 'public_domain' | 'licensed' | 'user_claimed' | 'unknown';
}

export type BookImportStatus = 'none' | 'preparing' | 'extracting' | 'splitting' | 'ready' | 'failed';

export interface AdminBookViewExt extends AdminBookView {
  import_status?: BookImportStatus;
  import_progress?: number;
  import_error?: string | null;
  linked_photo_set_id?: string | null;
}

export interface UploadPolicyResponse {
  provider: string;
  method: string;
  bucket: string;
  region: string;
  put_url: string;
  key: string;
  expires_at: string;
  key_prefix: string;
  max_size_mb: number;
  public_base_url: string;
}

export interface ChapterImportItem {
  order_no: number;
  title: string;
  start_page?: number;
  end_page?: number;
  content_summary?: string;
  content_full?: string;
}

// ===== 用户 =====

export interface AdminUserView {
  id: string;
  openid_masked: string;
  nickname: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: number;
  privacy_version: string | null;
  privacy_agreed_at: string | null;
  last_login_at: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface AdminUserDetail extends AdminUserView {
  stats: {
    papers: number;
    answers: number;
    mistakes_active: number;
    last_paper_at: string | null;
  };
}

// ===== 审核日志 =====

export interface ModerationLogView {
  id: string;
  user_id: string | null;
  scene: string;
  result: 'pass' | 'block' | 'warn';
  reason: string | null;
  api_provider: string;
  content_hash: string;
  content_snapshot_url: string | null;
  created_at: string;
}

// ===== 系统配置 =====

export interface SystemConfigView {
  key: string;
  /** 敏感字段 (is_secret=true) 时, value 是 `••••••••<last4>` 形式的脱敏字串 */
  value: unknown;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
  /** 后端标注: 该字段是否属于敏感凭证(API Key / Secret / Token / Password) */
  is_secret?: boolean;
}

// ===== 拍照集(用户上传素材)=====

export type OcrStatus = 'pending' | 'processing' | 'done' | 'failed';

export type PhotoRegionKind = 'text' | 'chart' | 'formula' | 'table';

export interface PhotoRegionView {
  id: string;
  bbox: [number, number, number, number];
  coord: 'normalized' | 'pixel';
  kind: PhotoRegionKind;
  ocr_text: string | null;
  chart_data: Record<string, unknown> | null;
  corrected: number;
  note: string | null;
}

export interface AdminPhotoView {
  id: string;
  photo_set_id: string;
  order_no: number;
  image_url: string;
  ocr_text: string | null;
  ocr_corrected: number;
  regions: PhotoRegionView[];
  created_at: string;
}

export interface AdminPhotoSetView {
  id: string;
  user_id: string;
  user_nickname: string | null;
  name: string | null;
  ocr_status: OcrStatus;
  total_pages: number;
  ocr_text: string | null;
  expires_at: string;
  created_at: string;
}

export interface AdminPhotoSetDetail extends AdminPhotoSetView {
  photos: AdminPhotoView[];
}

export interface UpdateAdminPhotoPayload {
  ocr_text?: string;
  order_no?: number;
  regions?: PhotoRegionView[];
}
