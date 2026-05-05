/**
 * 业务错误码
 * 文档:开发文档/03-API接口文档.md §1.3
 *
 * 命名规则:
 * - 1xxxx 通用 / 校验
 * - 2xxxx 鉴权 / 用户
 * - 3xxxx LLM / 出题 / 配额
 * - 4xxxx 内容安全 / OCR
 * - 5xxxx 数据库 / 系统
 */
export const ERROR_CODES = {
  SUCCESS: 0,

  // 通用
  PARAM_INVALID: 10001,
  RESOURCE_NOT_FOUND: 10002,
  RATE_LIMITED: 10003,

  // 鉴权 / 用户
  TOKEN_INVALID: 20001,
  USER_BANNED: 20002,
  USER_CANCELED: 20003,
  MINOR_TIME_LIMIT: 20004,
  PERMISSION_DENIED: 20005,

  // LLM / 出题 / 配额
  QUOTA_EXCEEDED: 30001,
  LLM_UNAVAILABLE: 30002,
  LLM_OUTPUT_INVALID: 30003,
  PAPER_CANCELED: 30004,

  // 内容安全 / OCR
  CONTENT_SENSITIVE: 40001,
  CONTENT_ILLEGAL: 40002,
  OCR_FAILED: 40003,

  // 数据库 / 系统
  DB_ERROR: 50001,
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * 错误码 → 默认中文提示
 * 业务侧可覆盖
 */
export const ERROR_MESSAGES: Record<number, string> = {
  [ERROR_CODES.SUCCESS]: 'ok',
  [ERROR_CODES.PARAM_INVALID]: '参数校验失败',
  [ERROR_CODES.RESOURCE_NOT_FOUND]: '资源不存在',
  [ERROR_CODES.RATE_LIMITED]: '操作过快,请稍后再试',
  [ERROR_CODES.TOKEN_INVALID]: '登录已过期,请重新登录',
  [ERROR_CODES.USER_BANNED]: '账号已被封禁',
  [ERROR_CODES.USER_CANCELED]: '账号已注销',
  [ERROR_CODES.MINOR_TIME_LIMIT]: '当前为未成年人模式时段限制',
  [ERROR_CODES.PERMISSION_DENIED]: '权限不足',
  [ERROR_CODES.QUOTA_EXCEEDED]: '今日出题次数已用尽,请明天再来',
  [ERROR_CODES.LLM_UNAVAILABLE]: 'AI 繁忙,请稍后再试',
  [ERROR_CODES.LLM_OUTPUT_INVALID]: 'AI 输出格式异常,已自动重试',
  [ERROR_CODES.PAPER_CANCELED]: '出题任务已取消',
  [ERROR_CODES.CONTENT_SENSITIVE]: '内容包含敏感信息,无法继续,请更换其他素材',
  [ERROR_CODES.CONTENT_ILLEGAL]: '检测到违规内容,操作已被记录',
  [ERROR_CODES.OCR_FAILED]: '图片识别失败,请检查光线或重拍',
  [ERROR_CODES.DB_ERROR]: '系统繁忙,请稍后再试',
};
