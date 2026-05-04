/**
 * Asia/Shanghai 时区工具
 * 文档:03-API §1.5(时间字段统一 ISO 8601 UTC, 客户端转 Asia/Shanghai 显示)
 *
 * 配额、错题统计、活跃用户等业务都按「自然日(Asia/Shanghai)」切割,
 * 因此后端必须有稳定的「上海日历日」概念
 *
 * Asia/Shanghai 全年固定 UTC+8, 无夏令时切换, 因此所有换算可以直接 ±8h
 */

const SHANGHAI_TZ = 'Asia/Shanghai';
const SHANGHAI_OFFSET_MS = 8 * 3600 * 1000;

/**
 * 当前上海日历日的 YYYY-MM-DD 字符串
 * 例:UTC 2026-05-04T17:00:00Z → '2026-05-05'
 */
export function todayInShanghaiString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * 当前上海日历日(午夜 00:00)对应的 Date 对象
 * 用于 Prisma `@db.Date` 字段;MySQL DATE 仅取年月日, 时间被丢弃
 */
export function todayInShanghaiAsDate(now: Date = new Date()): Date {
  const dateStr = todayInShanghaiString(now);
  // 用 Z 后缀, Prisma 将其格式化为 'YYYY-MM-DD' 写入 DATE 字段
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * 下一个上海 00:00 的 UTC Date(配额接口 reset_at 用)
 *
 * 例:UTC now=2026-05-05T08:30:00Z(上海 16:30)
 *   → 下一个上海 0 点 = 2026-05-06T00:00:00+08:00 = UTC 2026-05-05T16:00:00Z
 */
export function nextShanghaiMidnightUtc(now: Date = new Date()): Date {
  // 把 UTC 时间「先视作上海时区」, 加 8h 再取整到当天 00:00, 再 -8h 还原 UTC
  const cstView = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  cstView.setUTCHours(0, 0, 0, 0);
  cstView.setUTCDate(cstView.getUTCDate() + 1);
  return new Date(cstView.getTime() - SHANGHAI_OFFSET_MS);
}
