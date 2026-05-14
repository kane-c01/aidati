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

/** 出题加载页指数退避轮询参数(04-前端规范 §3.5)
 *
 * 节奏说明:
 * - 真实 LLM(qwen-plus)出 10 题约 30-40s, 极端可达 60-90s; mock 秒返回。
 * - 1.5s → 0.8s 是为了 ready 后跳页快, 但 TIMEOUT_MS 不能是 60s ——
 *   60s 就给"AI 思考超时了"会把已经成功跑完但还没轮到 detail 的 paper 误判为失败,
 *   而且后端 axios → ai-service 本身就是 90s, 所以前端至少给 150s 才合理。
 */
export const PAPER_POLL = {
  INITIAL_INTERVAL_MS: 800,
  STEP_MS: 400,
  MAX_INTERVAL_MS: 2000,
  /** 总超时:留足一次后端重试(约 90s × 1.5 安全余量) */
  TIMEOUT_MS: 150_000,
  CANCEL_WINDOW_MS: 30_000,
  /** 进度条满格阈值:进度按 BAR_FULL_MS 来推, 后面"还在思考"文案不再让进度条继续涨 */
  BAR_FULL_MS: 60_000,
} as const;

/** OCR 轮询(03-API §6)
 *
 * 节奏说明:
 * - 后端 runVisionOcr 4 路并发, 单批 5-15s。
 *   5 张图 ≈ 12-15s, 10 张图 ≈ 25-30s, 20 张图 ≈ 50-60s。
 * - 后端 startOcr 返回的 estimated_seconds = 8 * pages + 5,
 *   20 页就估算 165s, 前端 TIMEOUT_MS 必须 ≥ 这个数, 否则后端还没跑完就被前端误判为失败。
 * - SOFT_TIMEOUT_MS 是「自动停止轮询的下限」, 不是「展示『失败』的硬阈值」;
 *   到点后页面会切到「已识别多少, 是否继续等待」, 不会直接抛 toast。
 * - HARD_TIMEOUT_MS 是真正的兜底, 超过这个就算后端卡住, 直接置 failed。
 */
export const OCR_POLL = {
  INITIAL_INTERVAL_MS: 1500,
  MAX_INTERVAL_MS: 2500,
  /** 第一次提示「再等等」的时长(自适应文案) */
  SOFT_HINT_AT_MS: 30_000,
  /** 给用户选择「再等等 / 先用现有结果」的软超时 */
  SOFT_TIMEOUT_MS: 180_000,
  /** 真·硬超时, 后端卡死的兜底 */
  HARD_TIMEOUT_MS: 240_000,
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
