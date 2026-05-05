/**
 * 全局常量
 *
 * 与后端契约必须保持一致的, 单一来源在此, 不再散落到各业务文件。
 */

/** 业务错误码(03-API §1.3) */
export const ERROR_CODES = {
  OK: 0,
  PARAM_INVALID: 10001,
  RESOURCE_NOT_FOUND: 10002,
  RATE_LIMITED: 10003,

  TOKEN_INVALID: 20001,
  ACCOUNT_BANNED: 20002,
  ACCOUNT_CANCELLED: 20003,
  MINOR_TIME_LIMITED: 20004,

  QUOTA_EXCEEDED: 30001,
  LLM_UNAVAILABLE: 30002,
  LLM_FORMAT_ERROR: 30003,
  PAPER_CANCELLED: 30004,

  CONTENT_BLOCKED_SENSITIVE: 40001,
  CONTENT_BLOCKED_ILLEGAL: 40002,
  OCR_FAILED: 40003,

  DB_ERROR: 50001,
} as const;

/** TabBar 索引 — 自定义 tabbar 切换用 */
export const TAB_INDEX = {
  HOME: 0,
  PHOTO: 1,
  PROFILE: 2,
} as const;

/** TabBar 路径(注意带斜杠前缀) */
export const TAB_PATHS = {
  HOME: '/pages/home/index',
  PHOTO: '/pages/photo/index',
  PROFILE: '/pages/profile/index',
} as const;

/** 题型可选值(03-API §7.1) */
export const QUESTION_TYPES = ['single', 'multiple', 'judge', 'fill', 'short_answer'] as const;

export const QUESTION_TYPE_LABEL: Record<(typeof QUESTION_TYPES)[number], string> = {
  single: '单选',
  multiple: '多选',
  judge: '判断',
  fill: '填空',
  short_answer: '简答',
};

/** 难度 */
export const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'] as const;

export const DIFFICULTY_LABEL: Record<(typeof DIFFICULTY_LEVELS)[number], string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

/** 题量预设 */
export const COUNT_PRESETS = [5, 10, 20] as const;
export const COUNT_LIMIT = 50;

/** 单次拍照最大页数(PRD §4.3) */
export const MAX_PHOTO_PAGES = 20;

/** 出题加载页指数退避轮询参数(04-前端规范 §3.5) */
export const PAPER_POLL = {
  INITIAL_INTERVAL_MS: 1500,
  STEP_MS: 500,
  MAX_INTERVAL_MS: 3000,
  TIMEOUT_MS: 60_000,
  CANCEL_WINDOW_MS: 30_000,
} as const;

/** OCR 轮询(03-API §6) */
export const OCR_POLL = {
  INITIAL_INTERVAL_MS: 1500,
  MAX_INTERVAL_MS: 2500,
  TIMEOUT_MS: 60_000,
} as const;

/** Storage Key 命名空间 */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'auth.access_token',
  REFRESH_TOKEN: 'auth.refresh_token',
  USER_INFO: 'auth.user',
  ONBOARDING_DONE: 'app.onboarding_done',
  PRIVACY_AGREED: 'app.privacy_agreed_at',
  PHOTO_DRAFT: 'photo.local_draft',
  ANSWER_DRAFT_PREFIX: 'paper.answer_draft.',
  PAPER_GENERATING_ID: 'paper.generating_id',
  TRACKER_QUEUE: 'tracker.queue',
} as const;

/** 答题草稿本地保留时长(7 天) */
export const ANSWER_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** AI 内容标识固定文案(合规, 不可改) */
export const AI_DISCLAIMER_TEXT = '内容由 AI 生成,仅供参考';

/** AI 评分置信度阈值, 低于此值要在题旁显示「AI 评分置信度较低」 */
export const AI_LOW_CONFIDENCE_THRESHOLD = 0.7;
