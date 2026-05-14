/**
 * 与 ai-service(FastAPI)RPC 数据契约
 * 必须与 ai-service/app/models/ 严格对齐
 */

export type QuestionType = 'single' | 'multiple' | 'judge' | 'fill' | 'short_answer';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type SourceType = 'book' | 'chapter' | 'photo_set';

/** 与 ai-service LlmRuntimeConfig 对齐;后台 system_config 可覆盖各厂商 Key/Base URL */
export interface LlmRuntimeDto {
  primary_model: string;
  backup_model: string;
  deepseek_api_key?: string;
  qwen_api_key?: string;
  glm_api_key?: string;
  deepseek_base_url?: string;
  qwen_base_url?: string;
  glm_base_url?: string;
}

export interface GenerateConfigDto {
  question_types: QuestionType[];
  difficulty: DifficultyLevel;
  count: number;
  custom_prompt?: string | null;
}

export interface GeneratePaperRequestDto {
  paper_id: string;
  user_id: string;
  source_type: SourceType;
  config: GenerateConfigDto;
  context_text: string;
  book_title?: string | null;
  chapter_titles?: string[] | null;
  llm_runtime?: LlmRuntimeDto;
}

export interface QuestionOption {
  id: string;
  text: string;
}

export interface GeneratedQuestion {
  order_no: number;
  type: QuestionType;
  difficulty: DifficultyLevel;
  stem: string;
  options?: QuestionOption[] | null;
  correct_answer: unknown;
  explanation: string;
  knowledge_points: string[];
  score: number;
}

export interface LlmUsage {
  model: string;
  tokens_input: number;
  tokens_output: number;
  cost_yuan: number;
  provider: string;
}

export interface GeneratePaperResponseDto {
  paper_id: string;
  questions: GeneratedQuestion[];
  usage: LlmUsage;
}

export interface GradeAnswerItemDto {
  question_id: string;
  stem: string;
  reference_answer: string;
  knowledge_points: string[];
  user_answer: string;
  full_score: number;
}

export interface GradePaperRequestDto {
  paper_id: string;
  user_id: string;
  items: GradeAnswerItemDto[];
  llm_runtime?: LlmRuntimeDto;
}

export interface GradeAnswerResultDto {
  question_id: string;
  score: number;
  is_correct: boolean;
  confidence: number;
  feedback: string;
  suggestions?: string | null;
}

export interface GradePaperResponseDto {
  paper_id: string;
  results: GradeAnswerResultDto[];
  usage: LlmUsage;
}

// ===== 文档 / 区域识别 (M8) =====

export type RegionKind = 'text' | 'chart' | 'formula' | 'table';

export interface VisionRuntimeDto {
  provider?: string;
  model?: string;
  api_key?: string;
  base_url?: string;
}

export interface ExtractDocumentReqDto {
  /**
   * 图片 / PDF 的可访问 URL(优先 OSS 公网或预签)
   * 与 image_b64 二选一; 都传时 image_b64 优先
   */
  url?: string;
  /**
   * 图片字节的 base64(无 `data:image/...;base64,` 前缀)
   * 走这条路时 DashScope 不需要再从外网拉图, 适合内网部署 / OSS 不公开 / dev 环境
   */
  image_b64?: string;
  /** 配合 image_b64; 默认 'image/jpeg' */
  image_mime?: string;
  kind?: 'image' | 'pdf';
  language_hint?: string;
  vision_runtime?: VisionRuntimeDto;
}

export interface ExtractedRegionDto {
  kind: RegionKind;
  bbox?: number[];
  text?: string;
  chart_data?: Record<string, unknown>;
}

export interface ExtractedPageDto {
  page_no: number;
  markdown: string;
  regions: ExtractedRegionDto[];
}

export interface ExtractDocumentResDto {
  pages: ExtractedPageDto[];
  markdown: string;
  chapter_hints: string[];
  usage?: Record<string, unknown>;
}

export interface RecognizeRegionReqDto {
  image_url: string;
  bbox: [number, number, number, number];
  coord?: 'normalized' | 'pixel';
  kind?: RegionKind;
  vision_runtime?: VisionRuntimeDto;
}

export interface RecognizeRegionResDto {
  kind: RegionKind;
  ocr_text?: string;
  chart_data?: Record<string, unknown>;
  confidence?: number;
  usage?: Record<string, unknown>;
}

// ===== PDF → 多页图片(M8 PR2.6:供拍照集统一入口) =====

export interface PdfToImagesReqDto {
  url: string;
  max_pages?: number;
  dpi?: number;
  max_side?: number;
}

export interface PdfPageImageDto {
  page_no: number;
  width: number;
  height: number;
  /** PNG 字节的 base64;调用方解码后写入 OSS */
  png_b64: string;
}

export interface PdfToImagesResDto {
  pages: PdfPageImageDto[];
  total_pages: number;
  truncated: boolean;
}

export interface SplitChaptersReqDto {
  markdown: string;
  chapter_hints?: string[];
  book_title?: string;
  max_chapters?: number;
  llm_runtime?: LlmRuntimeDto;
}

export interface SplitChapterDto {
  order_no: number;
  title: string;
  content_summary?: string | null;
  content_full: string;
}

export interface SplitChaptersResDto {
  chapters: SplitChapterDto[];
  usage?: Record<string, unknown>;
}
