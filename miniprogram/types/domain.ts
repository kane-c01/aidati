/**
 * 业务领域类型
 *
 * 与 backend/src/**(NestJS)+ ai-service/app/models(Python)对齐, 由
 * 03-API接口文档.md / 02-数据库设计文档.md 单一来源描述。
 *
 * 全部 ID 字段在 JSON 中以字符串返回(BIGINT 防 JS 精度丢失)。
 */

// ===== 通用枚举 =====

export type UserRole = 'user' | 'admin' | 'super_admin';

export type QuestionType = 'single' | 'multiple' | 'judge' | 'fill' | 'short_answer';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export type PaperSourceType = 'book' | 'chapter' | 'photo_set';

export type PaperStatus = 'generating' | 'ready' | 'failed' | 'submitted' | 'graded';

export type OcrTaskStatus = 'pending' | 'processing' | 'done' | 'failed';

export type MistakeStatus = 'active' | 'mastered';

// ===== 用户 =====

export interface CurrentUser {
  id: string;
  nickname?: string;
  avatar_url?: string;
  role: UserRole;
  is_first_login?: boolean;
}

export interface UserStats {
  total_papers: number;
  total_questions: number;
  accuracy_rate: number;
  active_mistakes: number;
  mastered_mistakes: number;
}

export interface QuotaSnapshot {
  used_quota: number;
  limit: number;
  reset_at: string;
}

// ===== 书籍 / 章节 =====

export type BookImportStatus =
  | 'preparing'
  | 'extracting'
  | 'splitting'
  | 'ready'
  | 'failed';

export interface Book {
  id: string;
  title: string;
  author: string;
  cover_url: string | null;
  description: string | null;
  tags: string[];
  is_recommended: boolean;
  is_favorited?: boolean;
  /** M8 异步抽章状态(管理员录入的 ready;用户上传 / from-photo-set 创建时为 preparing → extracting → splitting → ready) */
  import_status?: BookImportStatus;
  import_progress?: number;
  import_error?: string | null;
  /** M8 PR2.6: 上传 PDF 自建书时双写生成的可校对 photo_set;有值则书详情页可跳"逐页校对" */
  linked_photo_set_id?: string | null;
}

export interface Chapter {
  id: string;
  order_no: number;
  title: string;
  start_page?: number | null;
  end_page?: number | null;
  /** 该章节是否已有可阅读的正文(后端 toChapterBrief 注入) */
  has_content?: boolean;
}

// ===== 拍照 / OCR =====

export type PhotoRegionKind = 'text' | 'chart' | 'formula' | 'table';

export interface PhotoRegion {
  id: string;
  /** [x, y, w, h], coord=normalized 时取值 0~1, coord=pixel 时为像素 */
  bbox: [number, number, number, number];
  coord: 'normalized' | 'pixel';
  kind: PhotoRegionKind;
  ocr_text?: string | null;
  chart_data?: Record<string, unknown> | null;
  /** 0/1: 是否已校对 */
  corrected?: number;
  note?: string | null;
}

export interface PhotoItem {
  id: string;
  photo_set_id: string;
  image_url: string;
  order_no: number;
  ocr_text?: string | null;
  ocr_status?: OcrTaskStatus;
  regions?: PhotoRegion[];
}

export interface PhotoSet {
  id: string;
  name?: string;
  expires_at?: string;
  ocr_status: OcrTaskStatus;
  ocr_text?: string;
  /** 已识别页数占比 0-100, 由 backend OcrSnapshot.progress 提供 */
  progress?: number;
  items: PhotoItem[];
}

// ===== 出题配置 =====

export interface GenerateConfig {
  question_types: QuestionType[];
  difficulty: DifficultyLevel;
  count: number;
  custom_prompt?: string;
}

// ===== 题目 / 试卷 =====

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  order_no: number;
  type: QuestionType;
  difficulty: DifficultyLevel;
  stem: string;
  options?: QuestionOption[] | null;
  /** 提交前不返回, 仅在 graded 之后(结果页)返回 */
  correct_answer?: unknown;
  explanation?: string;
  knowledge_points?: string[];
  score: number;
}

export interface Paper {
  id: string;
  status: PaperStatus;
  source_type: PaperSourceType;
  book_id?: string | null;
  chapter_id?: string | null;
  photo_set_id?: string | null;
  config: GenerateConfig;
  total_questions: number;
  created_at: string;
  questions?: Question[];
}

export interface PaperResultSummary {
  total_score: number;
  max_score: number;
  accuracy: number;
  time_spent_sec: number;
  rank_percentile?: number | null;
}

export interface AnswerItem {
  question_id: string;
  user_answer: unknown;
  time_spent_sec?: number;
}

export interface PaperResultQuestion extends Question {
  user_answer?: unknown;
  is_correct?: boolean;
  ai_feedback?: string;
  ai_confidence?: number;
  graded_by?: 'auto' | 'ai';
}

export interface PaperResult {
  paper_id: string;
  status: PaperStatus;
  summary: PaperResultSummary;
  questions: PaperResultQuestion[];
}

// ===== 错题本 =====

export interface MistakeItem {
  id: string;
  question: Question;
  book?: { id: string; title: string } | null;
  wrong_count: number;
  consecutive_correct: number;
  first_wrong_at: string;
  last_wrong_at: string;
  status: MistakeStatus;
}

export interface MistakeSummary {
  active: number;
  mastered: number;
}

// ===== 上传 =====

export interface UploadPolicy {
  provider: 'tencent_cos' | 'aliyun_oss' | 'minio';
  region?: string;
  bucket: string;
  /**
   * 服务端给的可直接 PUT 的预签名 URL(M2 后端实现); 若服务端只下发 STS 凭证,
   * 客户端再走 cos-wx-sdk 等 SDK 拼请求(MVP 不引入)。
   */
  put_url?: string;
  credentials?: {
    tmp_secret_id: string;
    tmp_secret_key: string;
    session_token: string;
    expires_at: string;
  };
  key_prefix: string;
  /** 后端给客户端的对象 key(配合 put_url 使用) */
  object_key?: string;
  max_size_mb: number;
}

export type UploadScene = 'photo' | 'cover' | 'pdf';
